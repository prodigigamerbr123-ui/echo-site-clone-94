import { supabase } from "@/integrations/supabase/client";
import { enqueueResult, type QueueSchedule } from "../../supabase/functions/_shared/messageQueueContracts";

const pending = new Map<string, string>();

/** Persist only a payload digest and request ID, never names, message text or tokens. */
export async function enqueueMessages(studentIds: string[], content: string, schedule: QueueSchedule, scope: string) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) throw new Error("Entre novamente para enviar mensagens");
  const normalizedSchedule = schedule.kind === "custom"
    ? { ...schedule, intervals: schedule.intervals.map(({ days, count }) => ({ days, count })) } : schedule;
  const payload = JSON.stringify({ ids: [...studentIds].sort(), content: content.trim(), schedule: normalizedSchedule });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))),
    value => value.toString(16).padStart(2, "0")).join("");
  const storageKey = `workout-enqueue:${data.session.user.id}:${scope}:${digest}`;
  let requestId = pending.get(storageKey);
  try { requestId ??= sessionStorage.getItem(storageKey) ?? undefined; } catch { /* Memory fallback if browser storage is unavailable. */ }
  requestId ??= crypto.randomUUID();
  pending.set(storageKey, requestId);
  try { sessionStorage.setItem(storageKey, requestId); } catch { /* Keep the same ID in memory for retries. */ }
  const { data: result, error } = await supabase.rpc("enqueue_messages_tx", {
    _request_id: requestId, _student_ids: studentIds, _content: content.trim(), _schedule: { ...normalizedSchedule },
  });
  if (error) throw error; // An ambiguous network failure retains the original ID.
  const parsed = enqueueResult(result);
  if (parsed.requestId !== requestId) throw new Error("Identificador de envio divergente");
  pending.delete(storageKey);
  try { sessionStorage.removeItem(storageKey); } catch { /* Already confirmed; memory entry was cleared. */ }
  return parsed;
}
