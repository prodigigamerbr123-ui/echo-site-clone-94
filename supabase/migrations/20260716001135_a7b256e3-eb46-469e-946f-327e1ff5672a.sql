
-- ============================================================
-- Etapa 2: RLS real. Sai o "allow all", entra "só logado".
-- Cron jobs continuam funcionando via service_role (bypass RLS).
-- ============================================================

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ai_conversations','ai_messages','automation_settings','evaluations',
    'messages','predefined_messages','scheduled_messages','students'
  ]) LOOP
    -- drop all existing policies on the table
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- revoke anon, grant authenticated + service_role
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- ensure RLS on
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- single permissive policy: any logged-in user has full access
    EXECUTE format(
      'CREATE POLICY "Authenticated users full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- Cron helper functions: só service_role pode chamar direto
REVOKE ALL ON FUNCTION public.claim_due_scheduled_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_messages(integer) TO service_role;

REVOKE ALL ON FUNCTION public.reset_stuck_scheduled_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stuck_scheduled_messages() TO service_role;
