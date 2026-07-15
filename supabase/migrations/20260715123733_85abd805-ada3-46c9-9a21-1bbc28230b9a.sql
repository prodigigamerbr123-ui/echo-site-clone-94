ALTER TABLE public.students ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS students_phone_idx ON public.students(phone);
CREATE INDEX IF NOT EXISTS students_status_idx ON public.students(status);