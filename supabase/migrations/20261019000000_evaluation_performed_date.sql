BEGIN;

-- No historical backfill: the booked date is not proof of the actual visit date.
ALTER TABLE public.evaluations ADD COLUMN performed_on date;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_performed_on_finite
  CHECK (performed_on IS NULL OR isfinite(performed_on));
COMMENT ON COLUMN public.evaluations.performed_on IS 'Actual visit date explicitly reviewed at completion. NULL means unknown for legacy completions. completed_at remains the recording timestamp.';

-- Keep the existing restricted wrapper and its grants; update only its internal transaction.
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
        last_evaluation_date = greatest(last_evaluation_date, coalesce(ev.performed_on, (ev.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date))
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

-- New explicit completion path; legacy clients retain the original RPC contract.
CREATE FUNCTION public.complete_evaluation_on_tx(_evaluation_id uuid, _performed_on date, _messages jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE ev public.evaluations; birth date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND
    (auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.has_staff_role(ARRAY['admin','recepcao','avaliador'])) THEN
    RAISE EXCEPTION 'Profissional sem permissão para alterar avaliações' USING ERRCODE='42501';
  END IF;
  IF _performed_on IS NULL OR NOT isfinite(_performed_on) OR _performed_on > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Informe uma data de atendimento válida até hoje' USING ERRCODE='22023';
  END IF;
  -- Same lock order as scheduling/closing, including old clients.
  PERFORM pg_advisory_xact_lock(hashtext('workout:evaluation-agenda'));
  SELECT * INTO ev FROM public.evaluations WHERE id=_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada' USING ERRCODE='22023'; END IF;
  IF ev.status='completed' THEN
    IF ev.performed_on IS DISTINCT FROM _performed_on THEN
      RAISE EXCEPTION 'Avaliação já encerrada com outra data ou sem data informada. Confira o histórico.' USING ERRCODE='22023';
    END IF;
    RETURN public.mutate_evaluation_tx('completed',_evaluation_id);
  END IF;
  IF ev.status <> 'scheduled' THEN RAISE EXCEPTION 'Avaliação já encerrada. Confira o histórico.' USING ERRCODE='22023'; END IF;
  SELECT birth_date INTO birth FROM public.students WHERE id=ev.student_id;
  IF birth IS NOT NULL AND _performed_on < birth THEN
    RAISE EXCEPTION 'O atendimento não pode ser anterior ao nascimento do aluno' USING ERRCODE='22023';
  END IF;
  UPDATE public.evaluations SET performed_on=_performed_on WHERE id=_evaluation_id;
  -- Any reminder/content validation failure rolls back the visit date and summary as well.
  RETURN public.mutate_evaluation_tx('completed',_evaluation_id,_messages=>_messages);
END $$;
REVOKE ALL ON FUNCTION public.complete_evaluation_on_tx(uuid,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_evaluation_on_tx(uuid,date,jsonb) TO authenticated,service_role;

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
      'evaluationsCompletedMonth',count(*) FILTER (WHERE status='completed' AND coalesce(performed_on, (completed_at AT TIME ZONE 'America/Sao_Paulo')::date) >= (_month AT TIME ZONE 'America/Sao_Paulo')::date AND coalesce(performed_on, (completed_at AT TIME ZONE 'America/Sao_Paulo')::date) < (_next_month AT TIME ZONE 'America/Sao_Paulo')::date)
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
