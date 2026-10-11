BEGIN;

ALTER TABLE public.scheduled_messages
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN source_scheduled_at timestamptz,
  ADD COLUMN source_payment_due_date date,
  ADD COLUMN dispatch_started_at timestamptz;

-- Preserve uncertain legacy dispatches. They must not be returned to the queue.
UPDATE public.scheduled_messages SET dispatch_started_at = updated_at WHERE status = 'processing';
-- Stop legacy workers from extending already materialized occurrences during rollout.
UPDATE public.scheduled_messages SET recurrence_count = 1
WHERE recurrence_count > 1 AND status IN ('pending', 'failed');

CREATE OR REPLACE FUNCTION public.message_automation_key(_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _type IN ('evaluation_confirmation','evaluation_reminder_1d','evaluation_reminder_day') THEN 'evaluation_reminders'
    WHEN _type = 'evaluation_reminder' THEN 'evaluation_invite'
    WHEN _type = 'evaluation_followup' THEN 'evaluation_followup'
    WHEN _type = 'evaluation_reschedule' THEN 'no_show_reschedule'
    WHEN _type = 'welcome' THEN 'welcome_message'
    WHEN _type = 'reengagement' THEN 'reengagement'
    WHEN _type IN ('payment_reminder_before','payment_reminder_due') THEN 'payment_reminder'
    WHEN _type IN ('birthday','payment_overdue') THEN _type
  END;
$$;

UPDATE public.scheduled_messages sm SET
  expires_at = CASE WHEN public.message_automation_key(sm.message_type) IS NOT NULL
    THEN (((sm.scheduled_for AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') END,
  source_scheduled_at = (SELECT scheduled_at FROM public.evaluations WHERE id = sm.evaluation_id),
  source_payment_due_date = CASE WHEN sm.message_type LIKE 'payment_%'
    THEN (SELECT payment_due_date FROM public.students WHERE id = sm.student_id) END
WHERE sm.status IN ('pending','failed');

CREATE OR REPLACE FUNCTION public.bind_scheduled_message_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ev public.evaluations;
BEGIN
  IF NEW.evaluation_id IS NOT NULL THEN
    SELECT * INTO ev FROM public.evaluations WHERE id = NEW.evaluation_id;
    IF NOT FOUND OR ev.student_id <> NEW.student_id THEN
      RAISE EXCEPTION 'A mensagem deve pertencer ao aluno da avaliação';
    END IF;
    NEW.source_scheduled_at := ev.scheduled_at;
  END IF;
  IF NEW.message_type LIKE 'payment_%' THEN
    SELECT payment_due_date INTO NEW.source_payment_due_date FROM public.students WHERE id = NEW.student_id;
  END IF;
  IF public.message_automation_key(NEW.message_type) IS NOT NULL THEN
    NEW.expires_at := (((NEW.scheduled_for AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  END IF;
  IF NEW.message_type = 'recurring' THEN NEW.recurrence_count := 1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bind_scheduled_message_source BEFORE INSERT ON public.scheduled_messages
FOR EACH ROW EXECUTE FUNCTION public.bind_scheduled_message_source();

CREATE OR REPLACE FUNCTION public.cancel_changed_evaluation_messages()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
    UPDATE public.scheduled_messages SET status = 'cancelled', failure_reason = 'Avaliação alterada ou encerrada'
    WHERE evaluation_id = NEW.id AND status IN ('pending','processing') AND dispatch_started_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cancel_changed_evaluation_messages AFTER UPDATE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.cancel_changed_evaluation_messages();

-- Once handed to the provider an item cannot be edited/requeued/deleted blindly.
CREATE OR REPLACE FUNCTION public.guard_scheduled_message_dispatch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF OLD.dispatch_started_at IS NOT NULL AND (TG_OP = 'UPDATE' OR OLD.status <> 'sent') THEN
    RAISE EXCEPTION 'Envio já iniciado ou incerto. Confira no WhatsApp antes de reenviar.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'processing' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Mensagem em processamento. Atualize a lista antes de editar.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_scheduled_message_dispatch BEFORE UPDATE OR DELETE ON public.scheduled_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_scheduled_message_dispatch();

CREATE TABLE public.whatsapp_delivery_lease (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token uuid,
  next_dispatch_at timestamptz NOT NULL DEFAULT '-infinity',
  leased_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.whatsapp_delivery_lease(id) VALUES (true);
ALTER TABLE public.whatsapp_delivery_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_delivery_lease FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_delivery_lease TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_whatsapp_delivery_lease(_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_delivery_lease SET token = _token, leased_until = clock_timestamp() + interval '130 seconds'
  WHERE id AND leased_until <= clock_timestamp();
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.release_whatsapp_delivery_lease(_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.whatsapp_delivery_lease SET token = NULL, leased_until = '-infinity',
    next_dispatch_at = greatest(next_dispatch_at, clock_timestamp() + interval '5 seconds') WHERE id AND token = _token;
$$;

-- Linearization point for cancellation: revalidate after the worker's delay,
-- then mark dispatch started. Cancellation never pretends to recall an in-flight send.
CREATE OR REPLACE FUNCTION public.prepare_scheduled_message_dispatch(_id uuid, _expected_updated_at timestamptz, _lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.scheduled_messages; s public.students; ev public.evaluations; lease public.whatsapp_delivery_lease;
  reason text; automation_key text; today_sp date := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO lease FROM public.whatsapp_delivery_lease WHERE id FOR UPDATE;
  IF lease.token IS DISTINCT FROM _lease_token OR lease.leased_until <= clock_timestamp() + interval '35 seconds' THEN
    RAISE EXCEPTION 'Lease de envio expirada';
  END IF;
  SELECT * INTO m FROM public.scheduled_messages WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'processing' OR m.updated_at IS DISTINCT FROM _expected_updated_at OR m.dispatch_started_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO s FROM public.students WHERE id = m.student_id;
  IF NOT FOUND THEN reason := 'Aluno não encontrado'; END IF;
  IF m.expires_at <= clock_timestamp() THEN reason := 'Mensagem expirada'; END IF;
  automation_key := public.message_automation_key(m.message_type);
  IF automation_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.automation_settings WHERE key = automation_key AND enabled) THEN
    reason := 'Automação desligada';
  END IF;
  IF s.status <> 'active' AND m.message_type NOT IN ('manual','reengagement') THEN reason := 'Aluno inativo'; END IF;
  IF m.message_type = 'reengagement' AND s.status = 'active' THEN reason := 'Aluno já reativado'; END IF;
  IF m.message_type = 'birthday' AND (s.birth_date IS NULL OR to_char(s.birth_date,'MM-DD') <> to_char(today_sp,'MM-DD')) THEN
    reason := 'Aluno não faz aniversário hoje';
  END IF;
  IF m.evaluation_id IS NOT NULL THEN
    SELECT * INTO ev FROM public.evaluations WHERE id = m.evaluation_id;
    IF NOT FOUND OR ev.student_id <> m.student_id THEN reason := 'Avaliação não encontrada';
    ELSIF m.message_type IN ('evaluation_confirmation','evaluation_reminder_1d','evaluation_reminder_day') AND
      (ev.status <> 'scheduled' OR ev.scheduled_at <= clock_timestamp() OR ev.scheduled_at IS DISTINCT FROM m.source_scheduled_at) THEN
      reason := 'Avaliação encerrada, remarcada ou vencida';
    ELSIF m.message_type = 'evaluation_reminder_1d' AND (ev.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date <> today_sp + 1 THEN
      reason := 'Lembrete da véspera fora da data';
    ELSIF m.message_type = 'evaluation_reminder_day' AND (ev.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date <> today_sp THEN
      reason := 'Lembrete do dia fora da data';
    ELSIF m.message_type = 'evaluation_followup' AND ev.status <> 'completed' THEN reason := 'Avaliação ainda não realizada';
    ELSIF m.message_type = 'evaluation_reschedule' AND ev.status <> 'no_show' THEN reason := 'Falta não está mais registrada';
    END IF;
  ELSIF m.message_type IN ('evaluation_confirmation','evaluation_reminder_1d','evaluation_reminder_day','evaluation_followup','evaluation_reschedule') THEN
    reason := 'Mensagem sem avaliação vinculada';
  END IF;
  IF m.message_type = 'evaluation_reminder' AND EXISTS (
    SELECT 1 FROM public.evaluations WHERE student_id = m.student_id AND status = 'scheduled' AND scheduled_at > clock_timestamp()
  ) THEN reason := 'Aluno já possui avaliação agendada'; END IF;
  IF m.message_type LIKE 'payment_%' THEN
    IF s.payment_due_date IS NULL OR s.payment_due_date IS DISTINCT FROM m.source_payment_due_date THEN reason := 'Vencimento alterado';
    ELSIF m.message_type = 'payment_reminder_due' AND s.payment_due_date <> today_sp THEN reason := 'Vencimento não é hoje';
    ELSIF m.message_type = 'payment_overdue' AND s.payment_due_date >= today_sp THEN reason := 'Mensalidade não está vencida';
    ELSIF m.message_type = 'payment_reminder_before' AND s.payment_due_date <= today_sp THEN reason := 'Aviso antecipado vencido';
    END IF;
  END IF;
  IF reason IS NOT NULL THEN
    UPDATE public.scheduled_messages SET status = 'cancelled', failure_reason = reason WHERE id = _id;
    RETURN NULL;
  END IF;
  IF lease.next_dispatch_at > clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE public.whatsapp_delivery_lease SET next_dispatch_at = clock_timestamp() + interval '5 seconds' WHERE id;
  UPDATE public.scheduled_messages SET dispatch_started_at = clock_timestamp() WHERE id = _id RETURNING * INTO m;
  RETURN jsonb_build_object('message', to_jsonb(m), 'student', jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone));
END $$;

ALTER TABLE public.messages ADD COLUMN scheduled_message_id uuid REFERENCES public.scheduled_messages(id) ON DELETE SET NULL,
  ADD COLUMN provider_message_id text;
CREATE UNIQUE INDEX messages_scheduled_message_unique ON public.messages(scheduled_message_id) WHERE scheduled_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finish_scheduled_message_dispatch(_id uuid, _content text, _provider_message_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.scheduled_messages;
BEGIN
  SELECT * INTO m FROM public.scheduled_messages WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mensagem não encontrada'; END IF;
  IF m.status = 'sent' THEN RETURN; END IF;
  IF m.status <> 'processing' OR m.dispatch_started_at IS NULL OR nullif(_provider_message_id, '') IS NULL THEN
    RAISE EXCEPTION 'Estado de envio inválido';
  END IF;
  INSERT INTO public.messages(student_id, content, sent_at, status, scheduled_message_id, provider_message_id)
  VALUES (m.student_id, _content, clock_timestamp(), 'sent', m.id, _provider_message_id);
  UPDATE public.scheduled_messages SET status = 'sent', sent_at = clock_timestamp(), failure_reason = NULL WHERE id = m.id;
END $$;

CREATE OR REPLACE FUNCTION public.reset_stuck_scheduled_messages()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.scheduled_messages SET
    status = CASE WHEN dispatch_started_at IS NULL THEN 'pending' ELSE 'failed' END,
    failure_reason = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE 'Entrega incerta: envio interrompido. Confira no WhatsApp antes de reenviar.' END
  WHERE status = 'processing' AND updated_at < clock_timestamp() - interval '10 minutes';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.acquire_whatsapp_delivery_lease(uuid), public.release_whatsapp_delivery_lease(uuid),
  public.prepare_scheduled_message_dispatch(uuid,timestamptz,uuid), public.finish_scheduled_message_dispatch(uuid,text,text),
  public.reset_stuck_scheduled_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_whatsapp_delivery_lease(uuid), public.release_whatsapp_delivery_lease(uuid),
  public.prepare_scheduled_message_dispatch(uuid,timestamptz,uuid), public.finish_scheduled_message_dispatch(uuid,text,text),
  public.reset_stuck_scheduled_messages() TO service_role;
COMMIT;
