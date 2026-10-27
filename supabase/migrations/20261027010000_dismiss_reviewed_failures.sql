BEGIN;

-- Lets the front desk acknowledge failures that were already reviewed, so old
-- incidents stop counting as pending work. Nothing is sent; the original reason
-- is kept in failure_reason. Deliveries that may have reached WhatsApp
-- (dispatch_started_at set) still require the uncertain-delivery review.
CREATE FUNCTION public.dismiss_failed_messages_tx(_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE dismissed integer;
BEGIN
  IF NOT public.has_staff_role(ARRAY['admin','recepcao']) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(_ids),0) = 0 OR cardinality(_ids) > 1000 THEN RAISE EXCEPTION 'Seleção inválida'; END IF;
  UPDATE public.scheduled_messages
     SET status = 'cancelled',
         failure_reason = left('Falha revisada: ' || coalesce(failure_reason, 'sem motivo registrado'), 250)
   WHERE id = ANY(_ids) AND status = 'failed' AND dispatch_started_at IS NULL;
  GET DIAGNOSTICS dismissed = ROW_COUNT;
  RETURN jsonb_build_object('dismissed', dismissed);
END $$;
REVOKE ALL ON FUNCTION public.dismiss_failed_messages_tx(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_failed_messages_tx(uuid[]) TO authenticated, service_role;

COMMIT;
