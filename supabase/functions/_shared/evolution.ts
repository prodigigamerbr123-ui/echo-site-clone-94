export interface EvolutionSendResult {
  ok: boolean;
  httpStatus?: number;
  messageId?: string | null;
  reason?: string;
  bodyText?: string;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractMessageId(data: any): string | null {
  return firstString(
    data?.key?.id,
    data?.message?.key?.id,
    data?.data?.key?.id,
    data?.response?.key?.id,
    data?.messageId,
    data?.message_id,
    data?.id,
    data?.data?.messageId,
    data?.data?.message_id,
    data?.data?.id,
    data?.response?.messageId,
    data?.response?.message_id,
    data?.response?.id,
  );
}

function extractError(data: any): string | null {
  const direct = firstString(
    data?.error,
    data?.message,
    data?.response?.message,
    data?.data?.message,
    data?.data?.error,
  );
  if (direct) return direct;

  const nested = data?.response?.message;
  if (Array.isArray(nested)) return nested.filter(Boolean).join("; ");

  return null;
}

export async function getEvolutionState(baseUrl: string, instance: string, apiKey: string): Promise<string> {
  const resp = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    headers: { apikey: apiKey, "Content-Type": "application/json" },
  });
  const text = await resp.text();
  const data = safeJson(text);
  return data?.instance?.state || data?.state || "unknown";
}

export async function sendEvolutionText(params: {
  baseUrl: string;
  instance: string;
  apiKey: string;
  number: string;
  text: string;
}): Promise<EvolutionSendResult> {
  const state = await getEvolutionState(params.baseUrl, params.instance, params.apiKey);
  if (state !== "open") {
    return { ok: false, reason: `WhatsApp não conectado na Evolution (estado: ${state})` };
  }

  const resp = await fetch(`${params.baseUrl}/message/sendText/${params.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: params.apiKey },
    body: JSON.stringify({
      number: params.number,
      text: params.text,
      delay: 1200,
      linkPreview: false,
    }),
  });

  const bodyText = await resp.text();
  const data = safeJson(bodyText);
  const apiStatus = Number(data?.status ?? data?.statusCode ?? data?.response?.status);
  const messageId = extractMessageId(data);
  const apiError = extractError(data);

  console.log(
    `[evolution-send] http=${resp.status} apiStatus=${Number.isFinite(apiStatus) ? apiStatus : "n/a"} messageId=${messageId || "none"} body=${bodyText.slice(0, 500)}`,
  );

  if (!resp.ok || (Number.isFinite(apiStatus) && apiStatus >= 400)) {
    return {
      ok: false,
      httpStatus: resp.status,
      reason: apiError || `Evolution retornou HTTP ${resp.status}`,
      bodyText,
    };
  }

  if (apiError && !messageId) {
    return { ok: false, httpStatus: resp.status, reason: apiError, bodyText };
  }

  if (!messageId) {
    return {
      ok: false,
      httpStatus: resp.status,
      reason: "Evolution respondeu sem ID de mensagem; não confirmei o envio",
      bodyText,
    };
  }

  return { ok: true, httpStatus: resp.status, messageId, bodyText };
}