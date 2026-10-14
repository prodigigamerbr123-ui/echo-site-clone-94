import { record } from "./contracts.ts";

export type QueueSchedule =
  | { kind: "now" }
  | { kind: "quick"; when: "today" | "later"; repeat: boolean;
      days: { days7: boolean; days21: boolean; days45: boolean }; time: string }
  | { kind: "custom"; date: string; time: string; intervals: { days: number; count: number }[] }
  | { kind: "at"; scheduled_for: string; message_type: "manual" | "welcome" | "reengagement" };

export function enqueueResult(value: unknown): { queued: number; replayed: boolean; requestId: string } {
  const result = record(value);
  if (!Number.isInteger(result.queued) || typeof result.queued !== "number" || result.queued < 0 ||
      typeof result.replayed !== "boolean" || typeof result.request_id !== "string") {
    throw new Error("Resposta de enfileiramento inválida");
  }
  return { queued: result.queued, replayed: result.replayed, requestId: result.request_id };
}
