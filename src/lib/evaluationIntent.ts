import { supabase } from "@/integrations/supabase/client";

const pending = new Map<string, string>();
export interface EvaluationIntent {
  id: string;
  userId: string;
  storageKey: string;
}

export async function prepareEvaluationIntent(studentId: string, when: Date, notes: string | null): Promise<EvaluationIntent> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Entre novamente para agendar avaliações");
  const userId = data.session.user.id;
  const payload = JSON.stringify([studentId, when.toISOString(), notes]);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))),
    byte => byte.toString(16).padStart(2, "0")).join("");
  const storageKey = `workout-evaluation:${userId}:${digest}`;
  let id = pending.get(storageKey);
  try { id ??= sessionStorage.getItem(storageKey) ?? undefined; } catch { /* Keep retries stable in memory. */ }
  if (!id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) id = crypto.randomUUID();
  pending.set(storageKey, id);
  try { sessionStorage.setItem(storageKey, id); } catch { /* Reload recovery requires working browser storage. */ }
  return { id, userId, storageKey };
}

export async function evaluationUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Entre novamente para alterar avaliações");
  return data.session.user.id;
}

export async function assertEvaluationIdentity(intent: Pick<EvaluationIntent, "userId">) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== intent.userId) throw new Error("A sessão mudou. Abra novamente a agenda");
}

export function completeEvaluationIntent(intent: EvaluationIntent) {
  pending.delete(intent.storageKey);
  try { sessionStorage.removeItem(intent.storageKey); } catch { /* Server result was validated. */ }
}
