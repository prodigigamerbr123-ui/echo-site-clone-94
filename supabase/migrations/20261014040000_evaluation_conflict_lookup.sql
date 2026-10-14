-- Read-only preflight shared by the agenda and AI. The mutation transaction
-- remains the authority and rechecks conflicts under its advisory lock.
CREATE FUNCTION public.evaluation_schedule_conflicts(
  _student_id uuid, _scheduled_at timestamptz, _ignore_evaluation_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE _duplicate jsonb; _conflict jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_role(ARRAY['admin','recepcao','avaliador']) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  IF _scheduled_at IS NULL OR NOT isfinite(_scheduled_at) OR _scheduled_at<=statement_timestamp() THEN
    RAISE EXCEPTION 'Data deve ser futura' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.students WHERE id=_student_id) THEN
    RAISE EXCEPTION 'Aluno não encontrado' USING ERRCODE='22023';
  END IF;
  IF _ignore_evaluation_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.evaluations WHERE id=_ignore_evaluation_id AND student_id=_student_id AND status='scheduled'
  ) THEN RAISE EXCEPTION 'Avaliação inválida para remarcação' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('evaluation_id',e.id,'scheduled_at',e.scheduled_at) INTO _duplicate
    FROM public.evaluations e WHERE e.student_id=_student_id AND e.status='scheduled'
    AND e.id IS DISTINCT FROM _ignore_evaluation_id
    AND e.scheduled_at>=((statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    ORDER BY e.scheduled_at,e.id LIMIT 1;
  SELECT jsonb_build_object('evaluation_id',e.id,'student_name',s.name,'scheduled_at',e.scheduled_at) INTO _conflict
    FROM public.evaluations e JOIN public.students s ON s.id=e.student_id
    WHERE e.status='scheduled' AND e.id IS DISTINCT FROM _ignore_evaluation_id
    AND e.scheduled_at>_scheduled_at-interval '30 minutes' AND e.scheduled_at<_scheduled_at+interval '30 minutes'
    ORDER BY abs(extract(epoch FROM e.scheduled_at-_scheduled_at)),e.scheduled_at,e.id LIMIT 1;
  RETURN jsonb_build_object('duplicate',_duplicate,'conflict',_conflict);
END;
$$;
REVOKE ALL ON FUNCTION public.evaluation_schedule_conflicts(uuid,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.evaluation_schedule_conflicts(uuid,timestamptz,uuid) TO authenticated;
