CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job antigo se existir
SELECT cron.unschedule('process-scheduled-messages-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-messages-every-minute');

SELECT cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://guomwsidnwapizkprkmo.supabase.co/functions/v1/process-scheduled-messages',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b213c2lkbndhcGl6a3Bya21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTMxMzQsImV4cCI6MjA5MzA2OTEzNH0.JIqcK_DFrl62TBp5cqNjH_-qYSxAZuBPaa9_A8BqLOo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);