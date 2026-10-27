-- Prepare the daily queue at midnight in Brasilia (03:00 UTC).
-- Keep the worker cadence, authenticated command and job enabled state intact.
DO $migration$
DECLARE
  definition text;
  daily_job bigint;
BEGIN
  IF current_setting('cron.timezone') NOT IN ('GMT', 'UTC', 'Etc/UTC') THEN
    RAISE EXCEPTION 'Midnight schedule requires a UTC pg_cron timezone';
  END IF;

  -- The self-hosted VM configures jobs directly and may not have this helper.
  IF to_regprocedure('public.configure_automation_cron()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.configure_automation_cron()'::regprocedure) INTO definition;
    IF position(quote_literal('0 11 * * *') IN definition) > 0 THEN
      definition := replace(definition, '11:00 UTC = 08:00 America/Sao_Paulo.', '03:00 UTC = 00:00 America/Sao_Paulo.');
      EXECUTE replace(definition, quote_literal('0 11 * * *'), quote_literal('0 3 * * *'));
    ELSIF position(quote_literal('0 3 * * *') IN definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected daily cron configuration; inspect before changing';
    END IF;
  END IF;

  SELECT jobid INTO STRICT daily_job FROM cron.job WHERE jobname = 'daily-automation';
  PERFORM cron.alter_job(daily_job, schedule := '0 3 * * *');
END;
$migration$;
