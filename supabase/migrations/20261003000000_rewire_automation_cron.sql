-- Rewire scheduled Edge Function calls without hard-coding a Supabase project.
-- Configure these Vault secrets in the target project before calling the helper:
--   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CRON_SECRET

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.configure_automation_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_url text;
  publishable_key text;
  cron_secret text;
  headers_json jsonb;
  process_sql text;
  daily_sql text;
BEGIN
  BEGIN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO project_url USING 'SUPABASE_URL';
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO publishable_key USING 'SUPABASE_PUBLISHABLE_KEY';
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO cron_secret USING 'CRON_SECRET';
  EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
      RAISE EXCEPTION 'Supabase Vault não está disponível neste projeto';
  END;

  IF project_url IS NULL OR publishable_key IS NULL OR cron_secret IS NULL THEN
    RAISE EXCEPTION 'Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e CRON_SECRET no Vault antes de agendar os jobs';
  END IF;

  project_url := rtrim(project_url, '/');
  headers_json := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', publishable_key,
    'x-cron-secret', cron_secret
  );

  SELECT cron.unschedule('process-scheduled-messages-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages-every-minute');

  SELECT cron.unschedule('daily-automation-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-automation-daily');

  process_sql := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb);',
    project_url || '/functions/v1/process-scheduled-messages',
    headers_json::text
  );

  daily_sql := format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb);',
    project_url || '/functions/v1/daily-automation',
    headers_json::text
  );

  PERFORM cron.schedule(
    'process-scheduled-messages-every-minute',
    '* * * * *',
    process_sql
  );

  PERFORM cron.schedule(
    'daily-automation-daily',
    '0 7 * * *',
    daily_sql
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_automation_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_automation_cron() TO service_role;

-- Remove any jobs left by older migrations. They will be recreated after
-- the new project's Vault secrets are configured.
SELECT cron.unschedule('process-scheduled-messages-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages-every-minute');

SELECT cron.unschedule('daily-automation-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-automation-daily');