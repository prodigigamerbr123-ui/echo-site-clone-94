
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_messages_no_dup_per_day
ON public.scheduled_messages (
  student_id,
  message_type,
  ((scheduled_for AT TIME ZONE 'America/Sao_Paulo')::date)
)
WHERE status IN ('pending','processing','sent')
  AND message_type IN (
    'evaluation_reminder',
    'birthday',
    'payment_reminder_before',
    'payment_reminder_due',
    'payment_overdue'
  );
