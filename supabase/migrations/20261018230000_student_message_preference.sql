BEGIN;

-- Existing records keep their current contact behavior until explicitly changed.
ALTER TABLE public.students ADD COLUMN messages_enabled boolean NOT NULL DEFAULT true;
GRANT UPDATE (messages_enabled) ON public.students TO authenticated;
COMMENT ON COLUMN public.students.messages_enabled IS 'Per-student WhatsApp preference, independent of membership status. Disabled contact suppresses manual and automated queued sends.';

CREATE FUNCTION public.guard_student_message_preference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.students WHERE id=NEW.student_id AND NOT messages_enabled) THEN
    -- Skip inserts rather than rolling back an evaluation or a whole automation batch.
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    -- A retry must not reactivate cancelled or failed contact. Preserve dispatched evidence.
    IF NEW.status='pending' AND NEW.dispatch_started_at IS NULL THEN
      NEW.status := 'cancelled';
      NEW.failure_reason := 'Contato desativado pelo aluno';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_student_message_preference() FROM PUBLIC;
CREATE TRIGGER guard_student_message_preference BEFORE INSERT OR UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_message_preference();

CREATE FUNCTION public.cancel_disabled_student_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.scheduled_messages SET status='cancelled', failure_reason='Contato desativado pelo aluno'
  WHERE student_id=NEW.id AND status IN ('pending','processing') AND dispatch_started_at IS NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cancel_disabled_student_messages() FROM PUBLIC;
CREATE TRIGGER cancel_disabled_student_messages AFTER UPDATE OF messages_enabled ON public.students
  FOR EACH ROW WHEN (OLD.messages_enabled IS DISTINCT FROM NEW.messages_enabled AND NOT NEW.messages_enabled)
  EXECUTE FUNCTION public.cancel_disabled_student_messages();

-- Report actual inserts when the shared preference guard suppresses a recipient.
CREATE OR REPLACE FUNCTION public.enqueue_messages_tx(_request_id uuid, _student_ids uuid[], _content text, _schedule jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  _user uuid := auth.uid();
  _now timestamptz := statement_timestamp();
  _ids uuid[];
  _payload jsonb;
  _previous public.message_enqueue_requests%ROWTYPE;
  _kind text := _schedule->>'kind';
  _dates jsonb := '[]'::jsonb;
  _date_text text;
  _time_text text;
  _base timestamptz;
  _days integer;
  _count integer;
  _interval jsonb;
  _entry jsonb;
  _student record;
  _root uuid;
  _series boolean := false;
  _final text;
  _type text;
  _queued integer := 0;
  _inserted integer;
  _index integer := 0;
  _span integer := 0;
  _retry integer;
BEGIN
  IF _user IS NULL OR NOT public.has_staff_role(ARRAY['admin','recepcao']) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  IF _request_id IS NULL OR _student_ids IS NULL OR cardinality(_student_ids) NOT BETWEEN 1 AND 500
     OR array_position(_student_ids,NULL) IS NOT NULL OR _content IS NULL
     OR char_length(btrim(_content)) NOT BETWEEN 1 AND 1000
     OR jsonb_typeof(_schedule) IS DISTINCT FROM 'object' OR octet_length(_schedule::text)>16384 THEN
    RAISE EXCEPTION 'Informe uma mensagem de até 1000 caracteres e de 1 a 500 alunos' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO _ids FROM (SELECT DISTINCT unnest(_student_ids) id) s;
  IF cardinality(_ids) <> cardinality(_student_ids) THEN
    RAISE EXCEPTION 'Há alunos repetidos na seleção' USING ERRCODE='22023';
  END IF;
  _payload := jsonb_build_object('student_ids',_ids,'content',btrim(_content),'schedule',_schedule);
  -- Serialize identical request IDs across HTTP retries and concurrent connections.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_user::text||':'||_request_id::text,0));
  SELECT * INTO _previous FROM public.message_enqueue_requests WHERE user_id=_user AND request_id=_request_id;
  IF FOUND THEN
    IF _previous.payload <> _payload THEN
      RAISE EXCEPTION 'Identificador já utilizado para outro envio' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('request_id',_request_id,'queued',_previous.queued,'replayed',true);
  END IF;
  IF (SELECT count(*) FROM public.students WHERE id=ANY(_ids)) <> cardinality(_ids) THEN
    RAISE EXCEPTION 'Aluno não encontrado' USING ERRCODE='22023';
  END IF;

  IF _kind='now' THEN
    _span := CASE WHEN cardinality(_ids)<=5 THEN 0 WHEN cardinality(_ids)<=20 THEN least(30,cardinality(_ids)*2)
      WHEN cardinality(_ids)<=100 THEN 60 ELSE ceil(cardinality(_ids)*0.6)::int END;
    _dates := jsonb_build_array(jsonb_build_object('at',_now+interval '1 minute','type','manual'));
  ELSIF _kind='at' THEN
    IF coalesce(_schedule->>'scheduled_for','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION 'Data com fuso horário obrigatória' USING ERRCODE='22023';
    END IF;
    _base := (_schedule->>'scheduled_for')::timestamptz;
    _type := coalesce(_schedule->>'message_type','manual');
    IF _base<=_now OR _type NOT IN ('manual','welcome','reengagement') THEN
      RAISE EXCEPTION 'Data futura ou tipo de mensagem inválido' USING ERRCODE='22023';
    END IF;
    _dates := jsonb_build_array(jsonb_build_object('at',_base,'type',_type));
  ELSIF _kind IN ('quick','custom') THEN
    _time_text := _schedule->>'time';
    IF coalesce(_time_text,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Horário inválido' USING ERRCODE='22023';
    END IF;
    IF _kind='quick' THEN
      IF coalesce(_schedule->>'when','') NOT IN ('today','later')
        OR jsonb_typeof(_schedule->'repeat') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(_schedule->'days') IS DISTINCT FROM 'object'
        OR jsonb_typeof(_schedule->'days'->'days7') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(_schedule->'days'->'days21') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(_schedule->'days'->'days45') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Opções de agendamento inválidas' USING ERRCODE='22023';
      END IF;
      _base := (((_now AT TIME ZONE 'America/Sao_Paulo')::date)::text||' '||_time_text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
      IF _schedule->>'when'='today' THEN
        IF _base<=_now THEN RAISE EXCEPTION 'O horário de hoje já passou' USING ERRCODE='22023'; END IF;
        _dates := _dates || jsonb_build_array(jsonb_build_object('at',_base,'type','manual'));
      END IF;
      IF _schedule->>'when'='later' OR (_schedule->>'repeat')::boolean THEN
        FOREACH _days IN ARRAY ARRAY[7,21,45] LOOP
          IF (_schedule->'days'->>('days'||_days))::boolean THEN
            _dates := _dates || jsonb_build_array(jsonb_build_object('at',_base+make_interval(days=>_days),'type',_days||'_day_followup'));
          END IF;
        END LOOP;
      END IF;
    ELSE
      _date_text := _schedule->>'date';
      IF coalesce(_date_text,'') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Data inválida' USING ERRCODE='22023';
      END IF;
      _base := (_date_text||' '||_time_text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
      IF _base<=_now THEN RAISE EXCEPTION 'Data deve ser futura' USING ERRCODE='22023'; END IF;
      IF jsonb_typeof(_schedule->'intervals') IS DISTINCT FROM 'array' OR jsonb_array_length(_schedule->'intervals')>20 THEN
        RAISE EXCEPTION 'Intervalos inválidos (máximo 20)' USING ERRCODE='22023';
      END IF;
      _series := jsonb_array_length(_schedule->'intervals')>0;
      _dates := jsonb_build_array(jsonb_build_object('at',_base,'type','manual'));
      FOR _interval IN SELECT value FROM jsonb_array_elements(_schedule->'intervals') LOOP
        IF jsonb_typeof(_interval->'days') IS DISTINCT FROM 'number' OR jsonb_typeof(_interval->'count') IS DISTINCT FROM 'number'
          OR (_interval->>'days') !~ '^[0-9]{1,3}$' OR (_interval->>'count') !~ '^[0-9]{1,2}$' THEN
          RAISE EXCEPTION 'Intervalos devem ser números inteiros' USING ERRCODE='22023';
        END IF;
        _days := (_interval->>'days')::int; _count := (_interval->>'count')::int;
        IF _days NOT BETWEEN 1 AND 365 OR _count NOT BETWEEN 1 AND 52 THEN
          RAISE EXCEPTION 'Use intervalos de 1 a 365 dias e de 1 a 52 repetições' USING ERRCODE='22023';
        END IF;
        SELECT _dates || jsonb_agg(jsonb_build_object('at',_base+make_interval(days=>i*_days),'type','recurring','days',_days))
          INTO _dates FROM generate_series(1,_count) i;
      END LOOP;
      SELECT jsonb_agg(entry ORDER BY entry->>'at') INTO _dates FROM (
        SELECT DISTINCT ON (value->>'at') value AS entry FROM jsonb_array_elements(_dates)
          ORDER BY value->>'at',(value->>'days')::int NULLS FIRST
      ) unique_dates;
      IF jsonb_array_length(_dates)>105 THEN RAISE EXCEPTION 'Uma série permite até 104 repetições' USING ERRCODE='22023'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de agendamento inválido' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(_dates)=0 OR jsonb_array_length(_dates)*cardinality(_ids)>5000 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma data; máximo 5000 mensagens por lote' USING ERRCODE='22023';
  END IF;
  _retry := public.consume_staff_request_quota('send-whatsapp');
  IF _retry>0 THEN RAISE EXCEPTION 'Limite de envios atingido. Aguarde e tente novamente.' USING ERRCODE='PT429', DETAIL=_retry::text; END IF;
  FOR _student IN SELECT id,name FROM public.students WHERE id=ANY(_ids) ORDER BY id FOR KEY SHARE LOOP
    _root := gen_random_uuid();
    -- Escape replacement backslashes: names are literal data, never regex substitutions.
    _final := regexp_replace(btrim(_content),'\{nome\}',replace(_student.name,chr(92),chr(92)||chr(92)),'gi');
    IF char_length(_final)>1000 THEN RAISE EXCEPTION 'A mensagem personalizada ultrapassa 1000 caracteres' USING ERRCODE='22023'; END IF;
    FOR _entry IN SELECT value FROM jsonb_array_elements(_dates) LOOP
      _type := _entry->>'type';
      IF _type IN ('welcome','reengagement') THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_student.id::text||':'||_type,1));
        IF EXISTS(SELECT 1 FROM public.scheduled_messages WHERE student_id=_student.id AND message_type=_type AND status IN ('pending','processing')) THEN CONTINUE; END IF;
      END IF;
      _base := (_entry->>'at')::timestamptz;
      IF _kind='now' THEN
        _base := _base + make_interval(secs=>floor(random()*120)::int + CASE WHEN _span>0 THEN floor(_span*60.0*_index/(cardinality(_ids)-1))::int ELSE 0 END);
      END IF;
      INSERT INTO public.scheduled_messages(id,student_id,content,scheduled_for,message_type,status,recurrence_parent_id,recurrence_count,recurrence_interval_days)
        VALUES (CASE WHEN _series AND _type='manual' THEN _root ELSE gen_random_uuid() END,_student.id,_final,_base,_type,'pending',
          CASE WHEN _series THEN _root ELSE NULL END,1,(_entry->>'days')::int);
      GET DIAGNOSTICS _inserted = ROW_COUNT;
      _queued := _queued+_inserted;
    END LOOP;
    _index := _index+1;
  END LOOP;
  INSERT INTO public.message_enqueue_requests(user_id,request_id,payload,queued) VALUES(_user,_request_id,_payload,_queued);
  RETURN jsonb_build_object('request_id',_request_id,'queued',_queued,'replayed',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mutate_evaluation_internal_tx(
  _action text, _evaluation_id uuid, _student_id uuid DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL, _notes text DEFAULT NULL,
  _messages jsonb DEFAULT '[]', _allow_conflict boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ev public.evaluations; item jsonb; automation_key text; allowed_types text[];
  inserted_count integer; created_count integer := 0; in_flight integer := 0; target_status text; seen_types text[] := ARRAY[]::text[];
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
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
      created_count := created_count + inserted_count;
    END IF;
  END LOOP;
  SELECT count(*) INTO in_flight FROM public.scheduled_messages
  WHERE evaluation_id = _evaluation_id AND status = 'processing' AND dispatch_started_at IS NOT NULL;
  RETURN jsonb_build_object('evaluation_id', _evaluation_id, 'messages_created', created_count,
    'already_applied', false, 'in_flight', in_flight);
END $$;

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
  IF s.messages_enabled IS FALSE THEN reason := 'Contato desativado pelo aluno'; END IF;
  IF reason IS NOT NULL THEN
    UPDATE public.scheduled_messages SET status = 'cancelled', failure_reason = reason WHERE id = _id;
    RETURN NULL;
  END IF;
  IF lease.next_dispatch_at > clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE public.whatsapp_delivery_lease SET next_dispatch_at = clock_timestamp() + interval '5 seconds' WHERE id;
  UPDATE public.scheduled_messages SET dispatch_started_at = clock_timestamp() WHERE id = _id RETURNING * INTO m;
  RETURN jsonb_build_object('message', to_jsonb(m), 'student', jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone));
END $$;

CREATE OR REPLACE FUNCTION public.get_workout_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _role text := public.current_staff_role();
  _now timestamptz := now();
  _day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _start timestamptz;
  _end timestamptz;
  _week timestamptz;
  _month timestamptz;
  _next_month timestamptz;
  _params jsonb;
  _days numeric := 90;
  _interval numeric := 14;
  _attempts numeric := 3;
  _result jsonb;
BEGIN
  IF _role IS NULL OR _role NOT IN ('admin','recepcao','avaliador') THEN
    RAISE EXCEPTION 'Acesso ao painel não autorizado' USING ERRCODE = '42501';
  END IF;
  _start := _day::timestamp AT TIME ZONE 'America/Sao_Paulo';
  _end := (_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  _week := date_trunc('week', _day::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _month := date_trunc('month', _day::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _next_month := (date_trunc('month', _day::timestamp) + interval '1 month') AT TIME ZONE 'America/Sao_Paulo';
  SELECT params INTO _params FROM public.automation_settings WHERE key='evaluation_invite';
  IF _params ? 'days_overdue' THEN
    _days := (_params->>'days_overdue')::numeric;
  END IF;
  IF _params ? 'min_interval_days' THEN
    _interval := (_params->>'min_interval_days')::numeric;
  END IF;
  IF _params ? 'max_attempts' THEN
    _attempts := (_params->>'max_attempts')::numeric;
  END IF;
  IF _days IS NULL OR _interval IS NULL OR _attempts IS NULL
      OR _days < 0 OR _interval < 0 OR _attempts < 1 THEN
    RAISE EXCEPTION 'Confira os prazos de avaliação nas automações';
  END IF;

  WITH students AS MATERIALIZED (SELECT * FROM public.students),
  birthday AS (
    SELECT * FROM students WHERE status='active'
      AND to_char(birth_date,'MM-DD') = to_char(_day,'MM-DD')
  ),
  student_stats AS (
    SELECT jsonb_build_object(
      'totalStudents',count(*),
      'activeStudents',count(*) FILTER (WHERE status='active'),
      'inactiveStudents',count(*) FILTER (WHERE status IS DISTINCT FROM 'active'),
      'newStudentsMonth',count(*) FILTER (WHERE created_at >= _month AND created_at < _next_month),
      'studentsWithoutEvaluation',count(*) FILTER (WHERE had_evaluation IS NOT TRUE),
      'birthdaysToday',(SELECT count(*) FROM birthday),
      'paymentOverdueCount',count(*) FILTER (WHERE status='active' AND payment_due_date < _day),
      'paymentDueIn3DaysCount',count(*) FILTER (WHERE status='active' AND payment_due_date BETWEEN _day AND _day+3)
    ) AS value FROM students
  ),
  evaluation_stats AS (
    SELECT jsonb_build_object(
      'evaluationsToday',count(*) FILTER (WHERE status='scheduled' AND scheduled_at >= _start AND scheduled_at < _end),
      'evaluationsWeek',count(*) FILTER (WHERE status='scheduled' AND scheduled_at >= _week AND scheduled_at < _week+interval '7 days'),
      'evaluationsMonth',count(*) FILTER (WHERE status='scheduled' AND scheduled_at >= _month AND scheduled_at < _next_month),
      'evaluationsOverdue',count(*) FILTER (WHERE status='scheduled' AND scheduled_at < _start),
      'evaluationsCompletedMonth',count(*) FILTER (WHERE status='completed' AND completed_at >= _month AND completed_at < _next_month)
    ) AS value FROM public.evaluations
  ),
  queue_stats AS (
    SELECT jsonb_build_object(
      'messagesToSendToday',CASE WHEN _role IN ('admin','recepcao') THEN
        count(*) FILTER (WHERE status='pending' AND scheduled_for >= _start AND scheduled_for < _end) END,
      'scheduledMessages',CASE WHEN _role IN ('admin','recepcao') THEN
        count(*) FILTER (WHERE status='pending' AND scheduled_for >= _now AND scheduled_for < _now+interval '24 hours') END
    ) AS value FROM public.scheduled_messages
  ),
  sent_stats AS (
    SELECT jsonb_build_object('messagesSentToday',CASE WHEN _role IN ('admin','recepcao') THEN
      count(*) FILTER (WHERE status='sent' AND sent_at >= _start AND sent_at < _end) END) AS value
    FROM public.messages
  ),
  candidates AS (
    SELECT s.id,s.name,s.phone,'birthday'::text AS type,'Aniversário hoje! 🎂'::text AS action
    FROM birthday s WHERE s.messages_enabled AND _role IN ('admin','recepcao') AND NOT EXISTS (
      SELECT 1 FROM public.scheduled_messages m WHERE m.student_id=s.id AND m.message_type='birthday'
      AND (m.status IN ('pending','processing','uncertain') OR (m.status='sent' AND m.scheduled_for >= _start AND m.scheduled_for < _end))
    )
    UNION ALL
    SELECT s.id,s.name,s.phone,'evaluation',CASE WHEN s.last_evaluation_date IS NULL THEN
      'Primeira avaliação física' ELSE 'Avaliação física vencida (' ||
      floor(extract(epoch FROM (_now - (s.last_evaluation_date::timestamp AT TIME ZONE 'UTC')))/86400)::text || ' dias)' END
    FROM students s WHERE s.messages_enabled AND status='active' AND _role IN ('admin','recepcao') AND (
      (last_evaluation_date IS NOT NULL AND _now - (last_evaluation_date::timestamp AT TIME ZONE 'UTC') > _days * interval '1 day')
      OR (last_evaluation_date IS NULL AND had_evaluation IS NOT TRUE AND _now-COALESCE(enrollment_date::timestamp AT TIME ZONE 'America/Sao_Paulo',created_at) > interval '14 days')
    ) AND NOT EXISTS (
      SELECT 1 FROM public.evaluations e WHERE e.student_id=s.id AND e.status='scheduled' AND e.scheduled_at >= _now
    ) AND NOT EXISTS (
      SELECT 1 FROM public.scheduled_messages m WHERE m.student_id=s.id AND m.message_type='evaluation_reminder'
        AND (m.status IN ('pending','processing','uncertain') OR
          (m.status='sent' AND m.scheduled_for > _now-_interval * interval '1 day'))
    ) AND (SELECT count(*) FROM public.scheduled_messages m WHERE m.student_id=s.id AND m.message_type='evaluation_reminder'
      AND m.status='sent' AND (s.last_evaluation_date IS NULL OR m.scheduled_for >= (s.last_evaluation_date::timestamp AT TIME ZONE 'UTC'))) < _attempts
    UNION ALL
    SELECT s.id,s.name,s.phone,f.type,f.action FROM students s
    CROSS JOIN (VALUES (7,'daqui_7_dias','Acompanhamento da primeira semana'),
      (21,'daqui_21_dias','Acompanhamento da terceira semana')) AS f(days,type,action)
    WHERE s.messages_enabled AND s.status='active' AND _role IN ('admin','recepcao')
      AND s.created_at >= ((_day-f.days)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND s.created_at < ((_day-f.days+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND NOT EXISTS (SELECT 1 FROM public.scheduled_messages m WHERE m.student_id=s.id AND m.message_type=f.type
        AND m.status IN ('pending','processing','uncertain','sent'))
  ),
  agenda AS (
    SELECT e.id,e.scheduled_at,s.name FROM public.evaluations e JOIN students s ON s.id=e.student_id
    WHERE e.status='scheduled' AND e.scheduled_at >= _start AND e.scheduled_at < _end
    ORDER BY e.scheduled_at,e.id LIMIT 20
  ),
  birthday_names AS (SELECT id,name FROM birthday ORDER BY name,id LIMIT 20)
  SELECT jsonb_build_object(
    'version',1,'generatedAt',_now,'day',_day,
    'stats',student_stats.value || evaluation_stats.value || queue_stats.value || sent_stats.value,
    'actions',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.type,c.name,c.id) FROM candidates c),'[]'::jsonb),
    'agenda',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at,a.id) FROM agenda a),'[]'::jsonb),
    'birthdayNames',COALESCE((SELECT jsonb_agg(b.name ORDER BY b.name,b.id) FROM birthday_names b),'[]'::jsonb)
  ) INTO _result FROM student_stats,evaluation_stats,queue_stats,sent_stats;
  RETURN _result;
END $$;

COMMIT;
