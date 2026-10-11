BEGIN;
-- One transaction for the appointment, its reminders and the student's summary.
-- SECURITY INVOKER preserves the caller's RLS. Permissions are not expanded.
CREATE OR REPLACE FUNCTION public.mutate_evaluation_tx(
  _action text, _evaluation_id uuid, _student_id uuid DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL, _notes text DEFAULT NULL,
  _messages jsonb DEFAULT '[]', _allow_conflict boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ev public.evaluations; item jsonb; automation_key text; allowed_types text[];
  created_count integer := 0; in_flight integer := 0; target_status text; seen_types text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF _action NOT IN ('create','reschedule','cancel','completed','no_show') OR _evaluation_id IS NULL THEN
    RAISE EXCEPTION 'Ação de avaliação inválida';
  END IF;
  IF jsonb_typeof(_messages) IS DISTINCT FROM 'array' OR jsonb_array_length(_messages) > 3 THEN
    RAISE EXCEPTION 'Lista de mensagens inválida';
  END IF;
  -- Serialize conflict decisions so two devices cannot both pass an empty read.
  PERFORM pg_advisory_xact_lock(hashtext('workout:evaluation-agenda'));
  SELECT * INTO ev FROM public.evaluations WHERE id = _evaluation_id FOR UPDATE;
  IF _action = 'create' AND FOUND THEN
    IF ev.student_id = _student_id AND ev.scheduled_at = _scheduled_at AND ev.status = 'scheduled' THEN
      RETURN jsonb_build_object('evaluation_id', ev.id, 'messages_created', 0, 'already_applied', true, 'in_flight', 0);
    END IF;
    RAISE EXCEPTION 'Identificador de operação já utilizado';
  ELSIF _action <> 'create' AND NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada'; END IF;

  IF _action IN ('create','reschedule') THEN
    IF _scheduled_at IS NULL OR NOT isfinite(_scheduled_at) OR _scheduled_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'A avaliação deve ter uma data futura válida';
    END IF;
    IF _action = 'reschedule' THEN
      IF ev.status <> 'scheduled' THEN RAISE EXCEPTION 'Só avaliações agendadas podem ser remarcadas'; END IF;
      IF ev.scheduled_at = _scheduled_at AND ev.notes IS NOT DISTINCT FROM _notes THEN
        RETURN jsonb_build_object('evaluation_id', ev.id, 'messages_created', 0, 'already_applied', true, 'in_flight', 0);
      END IF;
      _student_id := ev.student_id;
    END IF;
    PERFORM 1 FROM public.students WHERE id = _student_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
    IF EXISTS (SELECT 1 FROM public.evaluations WHERE student_id = _student_id AND status = 'scheduled'
      AND id <> _evaluation_id AND scheduled_at >= ((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')) THEN
      RAISE EXCEPTION 'Aluno já possui avaliação agendada';
    END IF;
    IF NOT _allow_conflict AND EXISTS (SELECT 1 FROM public.evaluations WHERE status = 'scheduled' AND id <> _evaluation_id
      AND scheduled_at > _scheduled_at - interval '30 minutes' AND scheduled_at < _scheduled_at + interval '30 minutes') THEN
      RAISE EXCEPTION 'Conflito de horário. Atualize a agenda e confirme o horário ocupado.';
    END IF;
    IF _action = 'create' THEN
      INSERT INTO public.evaluations(id, student_id, scheduled_at, status, notes)
      VALUES (_evaluation_id, _student_id, _scheduled_at, 'scheduled', _notes);
    ELSE
      UPDATE public.evaluations SET scheduled_at = _scheduled_at, notes = _notes WHERE id = _evaluation_id;
    END IF;
    automation_key := 'evaluation_reminders';
    allowed_types := ARRAY['evaluation_confirmation','evaluation_reminder_1d','evaluation_reminder_day'];
  ELSE
    target_status := CASE WHEN _action = 'cancel' THEN 'cancelled' ELSE _action END;
    IF ev.status = target_status THEN
      RETURN jsonb_build_object('evaluation_id', ev.id, 'messages_created', 0, 'already_applied', true, 'in_flight', 0);
    END IF;
    IF ev.status <> 'scheduled' THEN RAISE EXCEPTION 'Avaliação já encerrada. Atualize a agenda.'; END IF;
    IF _action IN ('completed','no_show') AND (ev.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'Não é possível encerrar uma avaliação de um dia futuro';
    END IF;
    UPDATE public.evaluations SET status = target_status,
      completed_at = CASE WHEN target_status = 'completed' THEN clock_timestamp() ELSE NULL END
    WHERE id = _evaluation_id;
    _student_id := ev.student_id;
    IF target_status = 'completed' THEN
      UPDATE public.students SET had_evaluation = true,
        last_evaluation_date = greatest(last_evaluation_date, (ev.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date)
      WHERE id = ev.student_id;
      automation_key := 'evaluation_followup'; allowed_types := ARRAY['evaluation_followup'];
    ELSIF target_status = 'no_show' THEN
      automation_key := 'no_show_reschedule'; allowed_types := ARRAY['evaluation_reschedule'];
    ELSE allowed_types := ARRAY[]::text[];
    END IF;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_messages) LOOP
    IF NOT (coalesce(item->>'message_type','') = ANY(allowed_types)) OR item->>'message_type' = ANY(seen_types) OR
      nullif(btrim(item->>'content'),'') IS NULL OR length(item->>'content') > 1000 OR
      item->>'scheduled_for' IS NULL OR NOT isfinite((item->>'scheduled_for')::timestamptz) OR
      (item->>'scheduled_for')::timestamptz <= clock_timestamp() THEN
      RAISE EXCEPTION 'Mensagem automática inválida';
    END IF;
    seen_types := array_append(seen_types, item->>'message_type');
    IF EXISTS (SELECT 1 FROM public.automation_settings WHERE key = automation_key AND enabled) THEN
      INSERT INTO public.scheduled_messages(student_id, evaluation_id, content, scheduled_for, message_type, status)
      VALUES (_student_id, _evaluation_id, item->>'content', (item->>'scheduled_for')::timestamptz, item->>'message_type', 'pending');
      created_count := created_count + 1;
    END IF;
  END LOOP;
  SELECT count(*) INTO in_flight FROM public.scheduled_messages
  WHERE evaluation_id = _evaluation_id AND status = 'processing' AND dispatch_started_at IS NOT NULL;
  RETURN jsonb_build_object('evaluation_id', _evaluation_id, 'messages_created', created_count,
    'already_applied', false, 'in_flight', in_flight);
END $$;
REVOKE ALL ON FUNCTION public.mutate_evaluation_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutate_evaluation_tx(text,uuid,uuid,timestamptz,text,jsonb,boolean) TO authenticated, service_role;

-- Compatibility for callers from a still-open old frontend during rollout.
CREATE OR REPLACE FUNCTION public.complete_evaluation_tx(_evaluation_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.mutate_evaluation_tx('completed', _evaluation_id);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_messages_tx(_ids uuid[], _whole_series boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cancelled_count integer; in_flight integer;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF coalesce(cardinality(_ids),0) = 0 OR cardinality(_ids) > 1000 THEN RAISE EXCEPTION 'Seleção inválida'; END IF;
  -- Lock all affected rows; the dispatcher and cancellation agree on who began first.
  PERFORM id FROM public.scheduled_messages WHERE id = ANY(_ids) OR
    (_whole_series AND recurrence_parent_id IN (SELECT coalesce(recurrence_parent_id,id) FROM public.scheduled_messages WHERE id = ANY(_ids)))
    ORDER BY id FOR UPDATE;
  SELECT count(*) INTO in_flight FROM public.scheduled_messages WHERE status = 'processing' AND dispatch_started_at IS NOT NULL AND
    (id = ANY(_ids) OR (_whole_series AND recurrence_parent_id IN (SELECT coalesce(recurrence_parent_id,id) FROM public.scheduled_messages WHERE id = ANY(_ids))));
  UPDATE public.scheduled_messages SET status = 'cancelled', failure_reason = 'Cancelada pelo usuário'
  WHERE status IN ('pending','processing','failed') AND dispatch_started_at IS NULL AND
    (id = ANY(_ids) OR (_whole_series AND recurrence_parent_id IN (SELECT coalesce(recurrence_parent_id,id) FROM public.scheduled_messages WHERE id = ANY(_ids))));
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN jsonb_build_object('cancelled',cancelled_count,'in_flight',in_flight);
END $$;
REVOKE ALL ON FUNCTION public.cancel_scheduled_messages_tx(uuid[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_messages_tx(uuid[],boolean) TO authenticated, service_role;
COMMIT;
