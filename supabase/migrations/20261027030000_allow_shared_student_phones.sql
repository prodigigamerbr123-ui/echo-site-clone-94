-- Legacy self-hosted schemas may still have this constraint. The application
-- permits shared family contacts and explicitly warns about them at registration.
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_phone_key;
CREATE INDEX IF NOT EXISTS students_phone_idx ON public.students(phone);
