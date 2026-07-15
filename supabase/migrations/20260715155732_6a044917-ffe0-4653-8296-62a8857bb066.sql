ALTER TABLE public.scheduled_messages REPLICA IDENTITY FULL;
ALTER TABLE public.evaluations REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;