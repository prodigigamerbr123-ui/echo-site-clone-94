-- Recovered base schema.
-- These tables existed before the first migration currently tracked in Git.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  birth_date date,
  had_evaluation boolean DEFAULT false,
  last_evaluation_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  content text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text
);

CREATE TABLE IF NOT EXISTS public.predefined_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  content text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  message_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_student_id_idx ON public.messages(student_id);
CREATE INDEX IF NOT EXISTS scheduled_messages_student_id_idx ON public.scheduled_messages(student_id);
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx ON public.scheduled_messages(status, scheduled_for);

DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduled_messages_updated_at ON public.scheduled_messages;
CREATE TRIGGER update_scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_automation_settings_updated_at ON public.automation_settings;
CREATE TRIGGER update_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predefined_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predefined_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_settings TO authenticated;

GRANT ALL ON public.students TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.predefined_messages TO service_role;
GRANT ALL ON public.scheduled_messages TO service_role;
GRANT ALL ON public.automation_settings TO service_role;

INSERT INTO public.automation_settings (key, enabled, params) VALUES
  ('evaluation_invite',    true,  '{"days_overdue": 90, "daily_limit": 60}'::jsonb),
  ('birthday',             true,  '{}'::jsonb),
  ('evaluation_reminders', true,  '{}'::jsonb),
  ('evaluation_followup',  true,  '{"days_after": 7}'::jsonb),
  ('no_show_reschedule',   true,  '{}'::jsonb),
  ('welcome_message',      false, '{}'::jsonb),
  ('reengagement',         false, '{"days_after": 20}'::jsonb)
ON CONFLICT (key) DO NOTHING;
