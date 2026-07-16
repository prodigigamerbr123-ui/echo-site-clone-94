
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Reagenda o job a cada minuto com header x-cron-secret vindo do vault
SELECT cron.unschedule('process-scheduled-messages-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages-every-minute');

SELECT cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://guomwsidnwapizkprkmo.supabase.co/functions/v1/process-scheduled-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b213c2lkbndhcGl6a3Bya21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTMxMzQsImV4cCI6MjA5MzA2OTEzNH0.JIqcK_DFrl62TBp5cqNjH_-qYSxAZuBPaa9_A8BqLOo',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Agenda daily-automation diariamente às 07:00 UTC (04:00 BRT)
SELECT cron.unschedule('daily-automation-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-automation-daily');

SELECT cron.schedule(
  'daily-automation-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://guomwsidnwapizkprkmo.supabase.co/functions/v1/daily-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b213c2lkbndhcGl6a3Bya21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTMxMzQsImV4cCI6MjA5MzA2OTEzNH0.JIqcK_DFrl62TBp5cqNjH_-qYSxAZuBPaa9_A8BqLOo',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
