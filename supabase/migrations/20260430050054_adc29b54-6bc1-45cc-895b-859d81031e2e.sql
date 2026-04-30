ALTER TABLE public.scheduled_messages 
ADD COLUMN IF NOT EXISTS recurrence_interval_days INTEGER,
ADD COLUMN IF NOT EXISTS recurrence_count INTEGER,
ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID;