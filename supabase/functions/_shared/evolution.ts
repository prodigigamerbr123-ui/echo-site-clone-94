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

export function parseEvolutionStatus(data: any) {
  const d = data?.data ?? data;
  const connected = (d?.Connected ?? d?.connected) === true;
  const loggedIn = (d?.LoggedIn ?? d?.loggedIn) === true;
  return {
    state: connected && loggedIn ? "open" : connected ? "connecting" : "close",
    connected: connected && loggedIn,
    instance: d?.Name ?? d?.name ?? null,
  };
}

export async function getEvolutionState(baseUrl: string, instanceToken: string): Promise<string> {
  try {
    const resp = await fetch(`${baseUrl}/instance/status`, {
      headers: { apikey: instanceToken, "Content-Type": "application/json", "User-Agent": "WorkoutSaaS/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return "unknown";
    const text = await resp.text();
    const data = safeJson(text);
    if (!data) return "unknown";
    return parseEvolutionStatus(data).state;
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
    headers: { "Content-Type": "application/json", apikey: params.instanceToken, "User-Agent": "WorkoutSaaS/1.0" },
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
