BEGIN;
CREATE TABLE public.ai_pending_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 tool text NOT NULL,
 args jsonb NOT NULL CHECK(jsonb_typeof(args)='object' AND octet_length(args::text)<=16384),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','executing','completed','failed')),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes'
);
ALTER TABLE public.ai_pending_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_pending_actions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_pending_actions TO service_role;
CREATE INDEX ai_pending_actions_owner ON public.ai_pending_actions(owner_id,created_at DESC);
CREATE FUNCTION public.claim_ai_action_tx(_id uuid,_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_pending_actions;
BEGIN
 SELECT * INTO a FROM public.ai_pending_actions WHERE id=_id AND owner_id=_owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Confirmação não encontrada' USING ERRCODE='42501'; END IF;
 IF a.state <> 'pending' THEN RETURN jsonb_build_object('state',a.state,'result',a.result); END IF;
 IF a.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Confirmação expirada' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.staff_members WHERE user_id=_owner_id AND active AND role IN ('admin','recepcao')
 ) THEN RAISE EXCEPTION 'Acesso revogado' USING ERRCODE='42501'; END IF;
 UPDATE public.ai_pending_actions SET state='executing' WHERE id=_id;
 RETURN jsonb_build_object('state','claimed','tool',a.tool,'args',a.args);
END $$;
CREATE FUNCTION public.finish_ai_action_tx(_id uuid,_owner_id uuid,_result jsonb,_failed boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.ai_pending_actions SET state=CASE WHEN _failed THEN 'failed' ELSE 'completed' END,result=_result
 WHERE id=_id AND owner_id=_owner_id AND state='executing';
 IF NOT FOUND THEN RAISE EXCEPTION 'Estado de confirmação inválido'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_ai_action_tx(uuid,uuid), public.finish_ai_action_tx(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_action_tx(uuid,uuid), public.finish_ai_action_tx(uuid,uuid,jsonb,boolean) TO service_role;
COMMIT;

