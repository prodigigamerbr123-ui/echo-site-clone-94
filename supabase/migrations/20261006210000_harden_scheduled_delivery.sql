-- Evita reenvio automático quando não é possível saber se uma mensagem
-- chegou a ser entregue ao provedor antes de o worker ser interrompido.
-- Falhas confirmadas continuam usando o retry normal da Edge Function.

CREATE OR REPLACE FUNCTION public.reset_stuck_scheduled_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.scheduled_messages
  SET
    status = 'failed',
    failure_reason = COALESCE(
      failure_reason,
      'Envio interrompido em estado incerto. Confirme no WhatsApp antes de tentar novamente.'
    ),
    updated_at = now()
  WHERE status = 'processing'
    AND updated_at < now() - interval '10 minutes';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_stuck_scheduled_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stuck_scheduled_messages() TO service_role;
