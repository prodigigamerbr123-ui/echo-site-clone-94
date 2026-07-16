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

function extractError(data: any): string | null {
  if (!data) return null;
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object") {
    return data.error.message || JSON.stringify(data.error);
  }
  if (typeof data.message === "string" && data.message !== "success") return data.message;
  return null;
}

export async function getEvolutionState(baseUrl: string, instanceToken: string): Promise<string> {
  try {
    const resp = await fetch(`${baseUrl}/instance/status`, {
      headers: { apikey: instanceToken, "Content-Type": "application/json" },
    });
    const text = await resp.text();
    const data = safeJson(text);
    const d = data?.data || data;
    if (d?.Connected && d?.LoggedIn) return "open";
    if (d?.Connected) return "connecting";
    return "close";
  } catch (_) {
    return "unknown";
  }
}

export async function sendEvolutionText(params: {
  baseUrl: string;
  instanceToken: string;
  number: string;
  text: string;
}): Promise<EvolutionSendResult> {
  const state = await getEvolutionState(params.baseUrl, params.instanceToken);
  if (state !== "open") {
    return { ok: false, reason: `WhatsApp não conectado na Evolution (estado: ${state})` };
  }

  const resp = await fetch(`${params.baseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: params.instanceToken },
    body: JSON.stringify({
      number: params.number,
      text: params.text,
      delay: 1200,
    }),
  });

  const bodyText = await resp.text();
  const data = safeJson(bodyText);
  const messageId = data?.data?.Info?.ID || null;
  const apiError = extractError(data);

  console.log(
    `[evolution-send] http=${resp.status} messageId=${messageId || "none"} body=${bodyText.slice(0, 500)}`,
  );

  if (!resp.ok) {
    return {
      ok: false,
      httpStatus: resp.status,
      reason: apiError || `Evolution retornou HTTP ${resp.status}`,
      bodyText,
    };
  }

  if (!messageId) {
    return {
      ok: false,
      httpStatus: resp.status,
      reason: apiError || "Evolution respondeu sem ID de mensagem; não confirmei o envio",
      bodyText,
    };
  }

  return { ok: true, httpStatus: resp.status, messageId, bodyText };
}
