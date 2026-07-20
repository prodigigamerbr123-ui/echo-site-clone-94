
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS payment_due_date date;
CREATE UNIQUE INDEX IF NOT EXISTS students_cpf_unique ON public.students(cpf) WHERE cpf IS NOT NULL;

INSERT INTO public.automation_settings (key, enabled, params)
VALUES ('payment_reminder', true, '{"days_before": 3}'::jsonb)
ON CONFLICT (key) DO NOTHING;
