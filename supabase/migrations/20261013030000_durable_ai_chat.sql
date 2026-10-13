BEGIN;

ALTER TABLE public.ai_pending_actions ADD COLUMN conversation_id uuid
  REFERENCES public.ai_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_pending_actions ADD COLUMN description text NOT NULL DEFAULT 'Proposta de ação';
ALTER TABLE public.ai_pending_actions DROP CONSTRAINT ai_pending_actions_state_check;
ALTER TABLE public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_state_check
  CHECK (state IN ('pending','executing','completed','failed','rejected'));
ALTER TABLE public.ai_messages ADD COLUMN action_id uuid REFERENCES public.ai_pending_actions(id) ON DELETE SET NULL;
ALTER TABLE public.ai_messages ADD COLUMN reply_to uuid REFERENCES public.ai_messages(id) ON DELETE SET NULL;
CREATE INDEX ai_pending_actions_conversation_idx ON public.ai_pending_actions(conversation_id);
CREATE INDEX ai_messages_history_order_idx ON public.ai_messages(conversation_id,created_at,id);

-- A message must never link a proposal belonging to another owner/conversation.
CREATE FUNCTION public.guard_ai_message_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_pending_actions a JOIN public.ai_conversations c ON c.id=NEW.conversation_id
    WHERE a.id=NEW.action_id AND a.conversation_id=c.id AND a.owner_id=c.owner_id AND NEW.role='assistant'
  ) THEN
    RAISE EXCEPTION 'Proposta não pertence a esta conversa' USING ERRCODE='42501';
  END IF;
  IF NEW.reply_to IS NOT NULL AND (NEW.reply_to=NEW.id OR NEW.role<>'assistant' OR NOT EXISTS (
    SELECT 1 FROM public.ai_messages m WHERE m.id=NEW.reply_to AND m.conversation_id=NEW.conversation_id
  )) THEN RAISE EXCEPTION 'Resposta não pertence a esta conversa' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_ai_message_action() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_ai_message_action BEFORE INSERT OR UPDATE OF action_id,conversation_id,role,reply_to ON public.ai_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_ai_message_action();

-- Atomic, idempotent message append. Caller RLS is retained.
CREATE FUNCTION public.append_ai_message_tx(_id uuid,_conversation_id uuid,_role text,_content text,_action_id uuid DEFAULT NULL,_reply_to uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE _existing public.ai_messages;
BEGIN
  IF NOT public.has_staff_role(ARRAY['admin','recepcao']) OR NOT EXISTS (
    SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND owner_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Conversa indisponível' USING ERRCODE='42501'; END IF;
  IF _role IS NULL OR _role NOT IN ('user','assistant') OR _content IS NULL
      OR length(btrim(_content))=0 OR length(_content)>12000 THEN
    RAISE EXCEPTION 'Mensagem inválida' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ai_messages(id,conversation_id,role,content,action_id,reply_to)
    VALUES (_id,_conversation_id,_role,_content,_action_id,_reply_to) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO _existing FROM public.ai_messages WHERE id=_id;
  IF NOT FOUND OR _existing.conversation_id<>_conversation_id OR _existing.role<>_role
      OR _existing.content<>_content OR _existing.action_id IS DISTINCT FROM _action_id
      OR _existing.reply_to IS DISTINCT FROM _reply_to THEN
    RAISE EXCEPTION 'Não foi possível confirmar o salvamento desta mensagem' USING ERRCODE='22023';
  END IF;
  UPDATE public.ai_conversations SET updated_at=clock_timestamp() WHERE id=_conversation_id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.append_ai_message_tx(uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.append_ai_message_tx(uuid,uuid,text,text,uuid,uuid) TO authenticated;

-- Narrow access to metadata of proposals attached to the caller's own history.
-- The confirmation store itself remains unavailable to browser clients.
CREATE FUNCTION public.get_ai_conversation_history(_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE _messages jsonb;
BEGIN
  IF NOT public.has_staff_role(ARRAY['admin','recepcao']) OR NOT EXISTS (
    SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND owner_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Conversa indisponível' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'role',m.role,'content',m.content,'created_at',m.created_at,'replyTo',m.reply_to,
    'pendingAction',CASE WHEN a.id IS NOT NULL THEN jsonb_build_object(
      'id',a.id,'tool',a.tool,'args',a.args,'description',a.description) END,
    'actionState',CASE WHEN a.id IS NULL THEN NULL
      WHEN a.state='pending' AND a.expires_at<=now() THEN 'expired'
      WHEN a.state='completed' AND a.result->'success'='false'::jsonb THEN 'blocked'
      ELSE a.state END
  ) ORDER BY m.created_at,m.id),'[]'::jsonb) INTO _messages
  FROM public.ai_messages m LEFT JOIN public.ai_pending_actions a
    ON a.id=m.action_id AND a.owner_id=auth.uid() AND a.conversation_id=_conversation_id
  WHERE m.conversation_id=_conversation_id;
  RETURN jsonb_build_object('version',1,'messages',_messages);
END $$;
REVOKE ALL ON FUNCTION public.get_ai_conversation_history(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_conversation_history(uuid) TO authenticated;

CREATE FUNCTION public.reject_ai_action_tx(_id uuid,_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_pending_actions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id=_owner_id AND active AND role IN ('admin','recepcao'))
    THEN RAISE EXCEPTION 'Acesso revogado' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.ai_pending_actions WHERE id=_id AND owner_id=_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta indisponível' USING ERRCODE='42501'; END IF;
  IF a.state='pending' THEN
    UPDATE public.ai_pending_actions SET state='rejected' WHERE id=_id;
    RETURN jsonb_build_object('state','rejected');
  END IF;
  RETURN jsonb_build_object('state',a.state,'result',a.result);
END $$;
REVOKE ALL ON FUNCTION public.reject_ai_action_tx(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_ai_action_tx(uuid,uuid) TO service_role;

-- Lock the conversation before claiming its proposal, matching deletion order.
CREATE OR REPLACE FUNCTION public.claim_ai_action_tx(_id uuid,_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ai_pending_actions; _conversation uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_members WHERE user_id=_owner_id AND active AND role IN ('admin','recepcao'))
    THEN RAISE EXCEPTION 'Acesso revogado' USING ERRCODE='42501'; END IF;
  SELECT conversation_id INTO _conversation FROM public.ai_pending_actions WHERE id=_id AND owner_id=_owner_id;
  IF _conversation IS NOT NULL THEN
    PERFORM 1 FROM public.ai_conversations WHERE id=_conversation AND owner_id=_owner_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conversa indisponível' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO a FROM public.ai_pending_actions WHERE id=_id AND owner_id=_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Confirmação não encontrada' USING ERRCODE='42501'; END IF;
  IF a.state<>'pending' THEN RETURN jsonb_build_object('state',a.state,'result',a.result); END IF;
  IF a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Confirmação expirada' USING ERRCODE='22023'; END IF;
  UPDATE public.ai_pending_actions SET state='executing' WHERE id=_id;
  RETURN jsonb_build_object('state','claimed','tool',a.tool,'args',a.args);
END $$;

CREATE FUNCTION public.guard_ai_conversation_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_pending_actions WHERE conversation_id=OLD.id AND state='executing') THEN
    RAISE EXCEPTION 'Há uma ação em execução. Confira o resultado antes de excluir a conversa';
  END IF;
  RETURN OLD;
END $$;
-- Trigger needs access to the private store but exposes no rows.
ALTER FUNCTION public.guard_ai_conversation_delete() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.guard_ai_conversation_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_ai_conversation_delete BEFORE DELETE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.guard_ai_conversation_delete();

COMMIT;
