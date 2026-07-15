
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_messages(_limit integer)
RETURNS SETOF public.scheduled_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_messages sm
  SET status = 'processing', updated_at = now()
  WHERE sm.id IN (
    SELECT id FROM public.scheduled_messages
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING sm.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_stuck_scheduled_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.scheduled_messages
  SET status = 'pending', updated_at = now()
  WHERE status = 'processing'
    AND updated_at < now() - interval '10 minutes';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_messages(integer) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.reset_stuck_scheduled_messages() TO service_role, authenticated, anon;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
