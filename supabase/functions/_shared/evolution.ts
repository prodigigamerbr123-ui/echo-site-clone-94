export interface EvolutionSendResult {
  ok: boolean;
  messageId: string | null;
  data: any;
  bodyText: string;
  error: string | null;
}

function safeJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function textFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const obj = asObject(value);
  if (!obj) return null;
  return obj.message || obj.error || obj.reason || obj.description || null;
}

function extractMessageId(data: any): string | null {
  const obj = asObject(data);
  if (!obj) return null;

  const candidates = [
    obj.key?.id,
    obj.data?.key?.id,
    obj.message?.key?.id,
    obj.messageId,
    obj.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return null;
}

function extractEvolutionError(data: any): string | null {
  const obj = asObject(data);
  if (!obj) return null;

  if (typeof obj.status === "number" && obj.status >= 400) {
    return textFrom(obj.message) || textFrom(obj.error) || `Evolution status ${obj.status}`;
  }

  if (typeof obj.statusCode === "number" && obj.statusCode >= 400) {
    return textFrom(obj.message) || textFrom(obj.error) || `Evolution status ${obj.statusCode}`;
  }

  if (typeof obj.status === "string") {
    const status = obj.status.toLowerCase();
    if (["error", "failed", "fail", "disconnected", "closed"].includes(status)) {
      return textFrom(obj.message) || textFrom(obj.error) || `Evolution status ${obj.status}`;
    }
  }

  if (obj.error) return textFrom(obj.error) || textFrom(obj.message) || "Erro retornado pela Evolution";
  if (obj.errors) return textFrom(obj.errors) || "Erros retornados pela Evolution";
  if (obj.response?.error) return textFrom(obj.response.error) || "Erro retornado pela Evolution";

  return null;
}

export async function parseEvolutionSendResponse(resp: Response): Promise<EvolutionSendResult> {
  const bodyText = await resp.text();
  const data = safeJson(bodyText);
  const messageId = extractMessageId(data);
  const apiError = extractEvolutionError(data);

  if (!resp.ok) {
    return {
      ok: false,
      messageId,
      data,
      bodyText,
      error: apiError || `HTTP ${resp.status}: ${bodyText.slice(0, 300)}`,
    };
  }

  if (apiError) {
    return { ok: false, messageId, data, bodyText, error: apiError };
  }

  if (!messageId) {
    return {
      ok: false,
      messageId: null,
      data,
      bodyText,
      error: `Evolution não confirmou o envio com ID da mensagem. Resposta: ${bodyText.slice(0, 300)}`,
    };
  }

  return { ok: true, messageId, data, bodyText, error: null };
}