import { supabase } from "@/integrations/supabase/client";
import { assertEvaluationIdentity, evaluationUserId } from "./evaluationIntent";

/** Compare the version opened in the editor instead of silently overwriting another edit. */
export async function saveEvaluationNotes(id: string, previous: string | null, next: string) {
  const actor = { userId: await evaluationUserId() };
  const notes = next === "" ? null : next;
  await assertEvaluationIdentity(actor);
  const update = supabase.from("evaluations").update({ notes }).eq("id", id);
  const filtered = previous === null ? update.is("notes", null) : update.eq("notes", previous);
  const { data, error } = await filtered.select("id,notes").maybeSingle();
  if (error) throw new Error("Não foi possível salvar as observações. Confira sua conexão e permissão de acesso");
  if (data) {
    if (data.id !== id || data.notes !== notes) throw new Error("Resposta inválida ao salvar observações");
    return;
  }
  // A lost response may have committed this same edit. Read it without overwriting.
  await assertEvaluationIdentity(actor);
  const current = await supabase.from("evaluations").select("id,notes").eq("id", id).maybeSingle();
  if (current.error) throw new Error("Não foi possível conferir as observações. Tente novamente");
  if (current.data?.id === id && current.data.notes === notes) return;
  throw new Error("A avaliação foi alterada ou não está mais acessível. Atualize o histórico antes de editar novamente");
}
