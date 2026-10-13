BEGIN;

-- Read-only snapshot: counts are aggregated in PostgreSQL, beyond REST row caps.
-- Caller RLS remains in force, including for the AI briefing. No service credentials.
CREATE FUNCTION public.get_workout_dashboard()
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
      'studentsWithoutEvaluation',count(*) FILTER (WHERE had_evaluation=false),
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
    FROM birthday s WHERE _role IN ('admin','recepcao') AND NOT EXISTS (
      SELECT 1 FROM public.scheduled_messages m WHERE m.student_id=s.id AND m.message_type='birthday'
      AND (m.status IN ('pending','processing','uncertain') OR (m.status='sent' AND m.scheduled_for >= _start AND m.scheduled_for < _end))
    )
    UNION ALL
    SELECT s.id,s.name,s.phone,'evaluation',CASE WHEN s.last_evaluation_date IS NULL THEN
      'Primeira avaliação física' ELSE 'Avaliação física vencida (' ||
      floor(extract(epoch FROM (_now - (s.last_evaluation_date::timestamp AT TIME ZONE 'UTC')))/86400)::text || ' dias)' END
    FROM students s WHERE status='active' AND _role IN ('admin','recepcao') AND (
      (last_evaluation_date IS NOT NULL AND _now - (last_evaluation_date::timestamp AT TIME ZONE 'UTC') > _days * interval '1 day')
      OR (last_evaluation_date IS NULL AND had_evaluation=false AND _now-created_at > interval '14 days')
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
    WHERE s.status='active' AND _role IN ('admin','recepcao')
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

REVOKE ALL ON FUNCTION public.get_workout_dashboard() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_workout_dashboard() TO authenticated;
COMMENT ON FUNCTION public.get_workout_dashboard() IS 'Read-only RLS snapshot; SP calendar; samples agenda and birthday names to 20, counts and actions complete.';
COMMIT;
