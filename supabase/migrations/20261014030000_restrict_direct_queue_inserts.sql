-- Apply only after the new frontend and Edge callers have been deployed.
-- SECURITY DEFINER evaluation transactions and server service_role workers retain INSERT.
REVOKE INSERT ON public.scheduled_messages FROM authenticated,anon;
DROP POLICY IF EXISTS queue_create ON public.scheduled_messages;

-- Reject whitespace-only content from every enqueue path, including server jobs.
-- INSERT-only guard preserves delivery updates to any legacy rows.
CREATE FUNCTION public.guard_queue_nonblank_content() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.content IS NULL OR NEW.content !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Digite uma mensagem com conteúdo' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_queue_nonblank_content() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_queue_nonblank_content BEFORE INSERT ON public.scheduled_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_queue_nonblank_content();
