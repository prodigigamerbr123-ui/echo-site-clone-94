BEGIN;

-- A change of due date must release pending reminders immediately. Otherwise
-- daily automation sees the old pending row and skips the new occurrence.
-- Once dispatch begins we cannot reliably recall a WhatsApp send.
CREATE FUNCTION public.cancel_outdated_payment_reminders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.scheduled_messages
     SET status = 'cancelled', failure_reason = 'Vencimento alterado'
   WHERE student_id = NEW.id
     AND message_type LIKE 'payment_%'
     AND status IN ('pending', 'processing')
     AND dispatch_started_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cancel_outdated_payment_reminders
AFTER UPDATE OF payment_due_date ON public.students
FOR EACH ROW
WHEN (OLD.payment_due_date IS DISTINCT FROM NEW.payment_due_date)
EXECUTE FUNCTION public.cancel_outdated_payment_reminders();

REVOKE ALL ON FUNCTION public.cancel_outdated_payment_reminders() FROM PUBLIC, anon, authenticated;

COMMIT;
