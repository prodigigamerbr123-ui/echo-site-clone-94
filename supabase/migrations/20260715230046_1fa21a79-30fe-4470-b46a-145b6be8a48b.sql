
CREATE TABLE public.automation_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on automation_settings"
  ON public.automation_settings FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.automation_settings (key, enabled, params) VALUES
  ('evaluation_invite',    true,  '{"days_overdue": 90, "daily_limit": 60}'::jsonb),
  ('birthday',             true,  '{}'::jsonb),
  ('evaluation_reminders', true,  '{}'::jsonb),
  ('evaluation_followup',  true,  '{"days_after": 7}'::jsonb),
  ('no_show_reschedule',   true,  '{}'::jsonb),
  ('welcome_message',      false, '{}'::jsonb),
  ('reengagement',         false, '{"days_after": 20}'::jsonb);
