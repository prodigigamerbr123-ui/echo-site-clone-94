BEGIN;

-- Capture changes at the database boundary, including renewals and manual edits.
-- No backfill: current values cannot prove a historical renewal or payment.
CREATE TABLE public.student_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  previous_plan text,
  plan text,
  previous_due_date date,
  payment_due_date date,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX student_plan_history_student_created_idx
  ON public.student_plan_history(student_id, created_at DESC, id DESC);

ALTER TABLE public.student_plan_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_plan_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.student_plan_history TO authenticated, service_role;
CREATE POLICY student_plan_history_front_desk_read
ON public.student_plan_history FOR SELECT TO authenticated
USING ((SELECT public.has_staff_role(ARRAY['admin','recepcao'])));

CREATE FUNCTION public.record_student_plan_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.student_plan_history (
    student_id, previous_plan, plan, previous_due_date, payment_due_date, actor_id
  ) VALUES (
    NEW.id, OLD.plan, NEW.plan, OLD.payment_due_date, NEW.payment_due_date, auth.uid()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_student_plan_change() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER record_student_plan_change
AFTER UPDATE OF plan, payment_due_date ON public.students
FOR EACH ROW
WHEN (OLD.plan IS DISTINCT FROM NEW.plan OR OLD.payment_due_date IS DISTINCT FROM NEW.payment_due_date)
EXECUTE FUNCTION public.record_student_plan_change();

COMMENT ON TABLE public.student_plan_history IS 'Immutable application history of plan/due-date changes from activation onward. Not a payment ledger. Student deletion cascades; no historical renewals inferred.';
NOTIFY pgrst, 'reload schema';
COMMIT;
