export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function errorMessage(value: unknown, fallback = "Falha na operação"): string {
  const message = record(value).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export interface EvaluationResult {
  evaluation_id: string;
  messages_created: number;
  already_applied: boolean;
  in_flight: number;
}

export function evaluationResult(value: unknown): EvaluationResult {
  const data = record(value);
  if (typeof data.evaluation_id !== "string" ||
      typeof data.messages_created !== "number" || !Number.isInteger(data.messages_created) || data.messages_created < 0 ||
      typeof data.already_applied !== "boolean" ||
      typeof data.in_flight !== "number" || !Number.isInteger(data.in_flight) || data.in_flight < 0) {
    throw new Error("Resposta inválida ao atualizar avaliação. Confira a agenda antes de tentar novamente.");
  }
  return {
    evaluation_id: data.evaluation_id, messages_created: data.messages_created,
    already_applied: data.already_applied, in_flight: data.in_flight,
  };
}
