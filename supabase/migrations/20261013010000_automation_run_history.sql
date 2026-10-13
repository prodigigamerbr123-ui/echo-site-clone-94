BEGIN;

-- A cron execution is distinct from the messages it decides to enqueue.
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  CONSTRAINT automation_runs_completion_check CHECK (
    (status = 'running' AND finished_at IS NULL) OR
    (status <> 'running' AND finished_at IS NOT NULL)
  )
);
CREATE INDEX automation_runs_started_at_idx ON public.automation_runs (started_at DESC);
-- Acquire the execution slot atomically. Never expire it automatically: an old
-- worker may still be writing. A stuck run requires an operator to stop that
-- worker and mark the run failed before another execution can start.
CREATE UNIQUE INDEX automation_runs_single_running_idx
  ON public.automation_runs ((true)) WHERE status = 'running';

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO service_role;
CREATE POLICY automation_runs_read_admin ON public.automation_runs
  FOR SELECT TO authenticated
  USING ((SELECT public.has_staff_role(ARRAY['admin'])));

-- Existing installations may lack this setting. Never overwrite customer choices.
INSERT INTO public.automation_settings (key, enabled, params)
VALUES (
  'payment_overdue', false,
  '{"days_after_due":1,"repeat_every_days":7}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
