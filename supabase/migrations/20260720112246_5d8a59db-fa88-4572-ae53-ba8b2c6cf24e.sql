CREATE OR REPLACE FUNCTION public.complete_evaluation_tx(_evaluation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student_id uuid;
  _scheduled_at timestamptz;
  _sp_date date;
BEGIN
  SELECT student_id, scheduled_at
    INTO _student_id, _scheduled_at
    FROM public.evaluations
    WHERE id = _evaluation_id
    FOR UPDATE;

  IF _student_id IS NULL THEN
    RAISE EXCEPTION 'Avaliação % não encontrada', _evaluation_id;
  END IF;

  -- Data (calendário) da avaliação em horário de Brasília (UTC-3, sem DST)
  _sp_date := (_scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date;

  UPDATE public.evaluations
     SET status = 'completed',
         completed_at = now()
   WHERE id = _evaluation_id;

  UPDATE public.students
     SET had_evaluation = true,
         last_evaluation_date = _sp_date
   WHERE id = _student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_evaluation_tx(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_evaluation_tx(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_evaluation_tx(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_evaluation_tx(uuid) TO service_role;