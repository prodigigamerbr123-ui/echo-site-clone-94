-- Etapa 1: fundação de agendamento de avaliações físicas

CREATE TABLE public.evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluations_status_check CHECK (status IN ('scheduled','completed','no_show','cancelled'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO anon, authenticated;
GRANT ALL ON public.evaluations TO service_role;

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on evaluations"
  ON public.evaluations FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_evaluations_student_id ON public.evaluations(student_id);
CREATE INDEX idx_evaluations_status ON public.evaluations(status);
CREATE INDEX idx_evaluations_scheduled_at ON public.evaluations(scheduled_at);

CREATE TRIGGER update_evaluations_updated_at
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vincular mensagens agendadas a uma avaliação (opcional)
ALTER TABLE public.scheduled_messages
  ADD COLUMN evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE SET NULL;

CREATE INDEX idx_scheduled_messages_evaluation_id
  ON public.scheduled_messages(evaluation_id);
