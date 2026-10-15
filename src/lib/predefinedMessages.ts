import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchAutomationTemplateIds } from "@/lib/automationTemplateIds";

export type PredefinedMessage = Tables<"predefined_messages">;
const columns = "id,title,content,created_at";

export async function loadPredefinedMessages() {
  const [{ data, error }, automationIds] = await Promise.all([
    supabase.from("predefined_messages").select(columns).order("title"),
    fetchAutomationTemplateIds(),
  ]);
  if (error) throw error;
  return { messages: data ?? [], automationIds };
}

export async function savePredefinedMessage(
  id: string,
  values: { title: string; content: string },
  editing: boolean,
): Promise<PredefinedMessage> {
  const payload = { title: values.title.trim(), content: values.content.trim() };
  if (!payload.title || !payload.content || payload.title.length > 100 || payload.content.length > 1000) {
    throw new Error("Preencha título e conteúdo, respeitando os limites de 100 e 1000 caracteres.");
  }
  if (editing) {
    const { data, error } = await supabase.from("predefined_messages")
      .update(payload).eq("id", id).select(columns).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Esta mensagem não está mais disponível para edição. Atualize a lista antes de tentar novamente.");
    return data;
  }
  const { data, error } = await supabase.from("predefined_messages")
    .insert({ id, ...payload }).select(columns).single();
  if (!error && data) return data;
  if (error?.code === "23505") {
    // Reuse the form's UUID after an uncertain response, without overwriting a row.
    const existing = await supabase.from("predefined_messages")
      .select(columns).eq("id", id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.title === payload.title && existing.data.content === payload.content) return existing.data;
    throw new Error("Uma tentativa anterior já usou este formulário. Confira a lista antes de criar outra mensagem.");
  }
  if (error) throw error;
  throw new Error("Não foi possível confirmar a criação. Seus campos foram mantidos para tentar novamente.");
}

export async function deletePredefinedMessage(id: string): Promise<void> {
  const { data, error } = await supabase.from("predefined_messages")
    .delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Esta mensagem não está mais disponível para exclusão. Atualize a lista.");
}
