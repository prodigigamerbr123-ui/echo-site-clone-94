-- Auditoria WorkOut: consultas somente de leitura.
-- Preparadas em 11/10/2026. Não executadas no banco de produção.
-- Execute no SQL Editor administrativo do Supabase.
-- Não selecionar cron.job.command: ele pode conter credenciais do cron.

-- 1. Políticas realmente instaladas.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2. RLS nas tabelas da aplicação.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 3. Permissões concedidas a chamadas públicas/autenticadas.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 4. Índices e constraints: verificar unicidade e invariantes.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, con.conname;

-- 5. Automações existentes; confirmar especialmente payment_overdue.
SELECT key, enabled, updated_at
FROM public.automation_settings
ORDER BY key;

-- 6. Fila agregada: não exibe nomes, telefones nem texto das mensagens.
SELECT status, message_type, count(*) AS total,
       min(scheduled_for) AS oldest_scheduled_for,
       max(scheduled_for) AS newest_scheduled_for
FROM public.scheduled_messages
GROUP BY status, message_type
ORDER BY status, message_type;

SELECT count(*) AS processing_over_10_minutes
FROM public.scheduled_messages
WHERE status = 'processing' AND updated_at < now() - interval '10 minutes';

-- 7. Possíveis repetições por série/horário. Não envia nem cancela nada.
SELECT message_type, scheduled_for, recurrence_parent_id, count(*) AS total
FROM public.scheduled_messages
WHERE message_type = 'recurring'
GROUP BY student_id, message_type, scheduled_for, recurrence_parent_id
HAVING count(*) > 1
ORDER BY scheduled_for;

-- 8. Verificação agregada de histórico que afeta a contagem de enviadas.
SELECT status, count(*) AS total
FROM public.messages
GROUP BY status
ORDER BY status;

-- 9. Jobs reais. Se pg_cron não estiver instalado, esta consulta falha
--    sem modificar nada. Não inclui a coluna command.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('process-scheduled-messages-every-minute',
                  'daily-automation', 'daily-automation-daily')
ORDER BY jobname;

SELECT jobid, runid, status, start_time, end_time
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job
  WHERE jobname IN ('process-scheduled-messages-every-minute',
                    'daily-automation', 'daily-automation-daily')
)
ORDER BY start_time DESC
LIMIT 30;

-- Status "succeeded" em pg_cron pode indicar apenas que o HTTP foi
-- enfileirado pelo pg_net. Conferir também os logs das Edge Functions.
-- Não confundir execução do cron com entrega de mensagem ao aluno.
