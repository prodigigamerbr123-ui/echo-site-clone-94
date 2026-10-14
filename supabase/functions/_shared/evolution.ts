import { isRecord, record } from "./contracts.ts";
export interface EvolutionSendResult {
  ok: boolean;
  uncertain?: boolean;
  httpStatus?: number;
  messageId?: string | null;
  reason?: string;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

export function parseEvolutionStatus(data: unknown) {
  const outer = record(data);
  const d = record(outer.data ?? data);
  const hasStatus = typeof (d.Connected ?? d.connected) === "boolean" || typeof (d.LoggedIn ?? d.loggedIn) === "boolean";
  const connected = (d?.Connected ?? d?.connected) === true;
  const loggedIn = (d?.LoggedIn ?? d?.loggedIn) === true;
  return {
    // Uma sessão ainda autenticada, mas temporariamente offline, deve aguardar
    // reconexão em vez de gerar um QR e iniciar outra sessão.
    state: !hasStatus ? "unknown" : connected && loggedIn ? "open" : connected || loggedIn ? "connecting" : "close",
    connected: connected && loggedIn,
    instance: typeof (d.Name ?? d.name) === "string" ? String(d.Name ?? d.name) : null,
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
    if (!isRecord(data)) return "unknown";
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
    signal: AbortSignal.timeout(15000),
  });

  const bodyText = await resp.text();
  const data = safeJson(bodyText);
  const rawId = record(record(record(data).data).Info).ID;
  const messageId = typeof rawId === "string" && rawId.trim() ? rawId : null;

  console.log(
    `[evolution-send] http=${resp.status} messageId=${messageId || "none"} `,
  );

  if (!resp.ok) {
    return {
      ok: false,
      httpStatus: resp.status,
      uncertain: resp.status >= 500,
      reason: `Evolution retornou HTTP ${resp.status}`,
    };
  }

  if (!messageId) {
    return {
      ok: false,
      httpStatus: resp.status,
      uncertain: true,
      reason: "Evolution respondeu sem ID de mensagem; não confirmei o envio",
    };
  }

  return { ok: true, httpStatus: resp.status, messageId };
}
