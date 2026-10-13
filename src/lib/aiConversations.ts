import { supabase } from "@/integrations/supabase/client";
import {
  chatHistory,
  type StoredChatMessage,
} from "../../supabase/functions/_shared/aiChatContracts";

export async function loadConversationHistory(id: string) {
  const { data, error } = await supabase.rpc("get_ai_conversation_history", {
    _conversation_id: id,
  });
  if (error) throw error;
  return chatHistory(data);
}
export async function appendChatMessage(
  conversationId: string,
  message: StoredChatMessage,
) {
  const { data, error } = await supabase.rpc("append_ai_message_tx", {
    _id: message.id,
    _conversation_id: conversationId,
    _role: message.role,
    _content: message.content,
    _action_id: message.pendingAction?.id ?? null,
    _reply_to: message.replyTo ?? null,
  });
  if (error) throw error;
  if (data !== message.id)
    throw new Error("Não foi possível confirmar o salvamento da mensagem.");
}
