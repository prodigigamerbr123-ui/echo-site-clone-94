CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access"
ON public.app_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value) VALUES (
  'notifications',
  '{
    "notify_failed": true,
    "notify_sent_summary": true,
    "sent_summary_minutes": 10,
    "notify_evaluation_created": true,
    "notify_whatsapp_disconnected": true,
    "notify_student_registered": false,
    "notify_daily_summary": true
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;