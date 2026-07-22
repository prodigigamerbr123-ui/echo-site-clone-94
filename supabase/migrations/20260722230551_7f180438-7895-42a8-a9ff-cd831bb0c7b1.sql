
REVOKE EXECUTE ON FUNCTION public.claim_due_scheduled_messages(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_stuck_scheduled_messages() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_messages(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_stuck_scheduled_messages() TO service_role;
