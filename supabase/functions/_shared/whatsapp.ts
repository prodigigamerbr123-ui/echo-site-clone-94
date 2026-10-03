import { getEvolutionState, sendEvolutionText } from "./evolution.ts";

export type WhatsAppProvider = "evolution" | "openwa";

export interface WhatsAppSendResult {
  ok: boolean;
  provider: WhatsAppProvider;
  httpStatus?: number;
  messageId?: string | null;
  reason?: string;
  bodyText?: string;
}

export interface WhatsAppStatusResult {
  provider: WhatsAppProvider;
  state: "open" | "connecting" | "close" | "unknown";
  connected: boolean;
  instance?: string | null;
  error?: string;
}

type ProviderConfig =
  | { provider: "evolution"; baseUrl: string; token: string }
  | { provider: "openwa"; baseUrl: string; apiKey: string };

function cleanUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function cleanOpenWaUrl(value: string): string {
  return cleanUrl(value).replace(/\/api$/i, "");
}

function configuredProvider(): WhatsAppProvider {
  const explicit = Deno.env.get("WHATSAPP_PROVIDER")?.trim().toLowerCase();
  if (explicit === "openwa" || explicit === "evolution") return explicit;
  if (explicit) throw new Error(`WHATSAPP_PROVIDER inválido: ${explicit}`);
  return Deno.env.get("OPENWA_API_URL") ? "openwa" : "evolution";
}

function getConfig(): ProviderConfig {
  const provider = configuredProvider();

  if (provider === "openwa") {
    const baseUrl = Deno.env.get("OPENWA_API_URL");
    const apiKey = Deno.env.get("OPENWA_API_KEY");
    if (!baseUrl || !apiKey) {
      throw new Error("OpenWA não configurado: defina OPENWA_API_URL e OPENWA_API_KEY");
    }
    return { provider, baseUrl: cleanOpenWaUrl(baseUrl), apiKey };
  }

  const baseUrl = Deno.env.get("EVOLUTION_API_URL");
  const token = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
  if (!baseUrl || !token) {
    throw new Error("Evolution não configurada: defina EVOLUTION_API_URL e EVOLUTION_INSTANCE_TOKEN");
  }
  return { provider, baseUrl: cleanUrl(baseUrl), token };
}

type JsonRecord = Record<string, unknown>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function openWaHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

function openWaChatId(number: string): string {
  if (number.includes("@")) return number;
  return `${number.replace(/\D/g, "")}@c.us`;
}

async function getOpenWaStatus(baseUrl: string, apiKey: string): Promise<WhatsAppStatusResult> {
  const resp = await fetch(`${baseUrl}/health`, { headers: openWaHeaders(apiKey) });
  const bodyText = await resp.text();
  const data = asRecord(safeJson(bodyText)) ?? {};
  const session = asRecord(data.session);

  if (!resp.ok) {
    return {
      provider: "openwa",
      state: "unknown",
      connected: false,
      error: firstString(data.error, data.message) || `OpenWA retornou HTTP ${resp.status}`,
    };
  }

  const connectedFlag = data.connected === true;
  const authenticatedFlag = data.authenticated === true;
  const sessionReady = session?.ready;
  const hasSessionReady = typeof sessionReady === "boolean";
  const connected = connectedFlag || authenticatedFlag;
  const ready = hasSessionReady ? sessionReady === true : connected;

  let state: WhatsAppStatusResult["state"] = "close";
  if (connected && ready) state = "open";
  else if (connected || sessionReady === true) state = "connecting";

  return {
    provider: "openwa",
    state,
    connected: state === "open",
    instance: firstString(session?.id, data.sessionId) || null,
  };
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatusResult> {
  let provider: WhatsAppProvider = "evolution";
  try {
    provider = configuredProvider();
    const config = getConfig();
    if (config.provider === "openwa") {
      return await getOpenWaStatus(config.baseUrl, config.apiKey);
    }

    const state = await getEvolutionState(config.baseUrl, config.token);
    return {
      provider: "evolution",
      state: state === "open" || state === "connecting" || state === "close" ? state : "unknown",
      connected: state === "open",
    };
  } catch (error) {
    return {
      provider,
      state: "unknown",
      connected: false,
      error: errorMessage(error),
    };
  }
}

async function sendOpenWaText(params: {
  baseUrl: string;
  apiKey: string;
  number: string;
  text: string;
}): Promise<WhatsAppSendResult> {
  const status = await getOpenWaStatus(params.baseUrl, params.apiKey);
  if (status.state !== "open") {
    return {
      ok: false,
      provider: "openwa",
      reason: status.error || `WhatsApp não conectado no OpenWA (estado: ${status.state})`,
    };
  }

  const resp = await fetch(`${params.baseUrl}/api/messages/sendText`, {
    method: "POST",
    headers: openWaHeaders(params.apiKey),
    body: JSON.stringify({
      to: openWaChatId(params.number),
      content: params.text,
    }),
  });

  const bodyText = await resp.text();
  const data = asRecord(safeJson(bodyText));
  const payload = data?.data;
  const payloadRecord = asRecord(payload);
  const payloadKey = asRecord(payloadRecord?.key);
  const messageId =
    typeof payload === "string"
      ? payload
      : firstString(payloadRecord?._serialized, payloadRecord?.id, payloadKey?.id) || null;

  if (!resp.ok || data?.success === false || payload === false) {
    return {
      ok: false,
      provider: "openwa",
      httpStatus: resp.status,
      reason: firstString(data?.error, data?.message) || `OpenWA retornou HTTP ${resp.status}`,
      bodyText,
    };
  }

  return {
    ok: true,
    provider: "openwa",
    httpStatus: resp.status,
    messageId,
    bodyText,
  };
}

export async function sendWhatsAppText(params: {
  number: string;
  text: string;
}): Promise<WhatsAppSendResult> {
  try {
    const config = getConfig();
    if (config.provider === "openwa") {
      return await sendOpenWaText({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        number: params.number,
        text: params.text,
      });
    }

    const result = await sendEvolutionText({
      baseUrl: config.baseUrl,
      instanceToken: config.token,
      number: params.number,
      text: params.text,
    });
    return { ...result, provider: "evolution" };
  } catch (error) {
    let provider: WhatsAppProvider = "evolution";
    try {
      provider = configuredProvider();
    } catch {
      provider = "evolution";
    }
    return { ok: false, provider, reason: errorMessage(error) };
  }
}

export async function listWhatsAppContacts(): Promise<{ provider: WhatsAppProvider; contacts: unknown[] }> {
  const config = getConfig();
  if (config.provider === "evolution") {
    return { provider: "evolution", contacts: [] };
  }

  const resp = await fetch(`${config.baseUrl}/api/contacts/getAll`, {
    method: "GET",
    headers: openWaHeaders(config.apiKey),
  });
  const bodyText = await resp.text();
  const data = asRecord(safeJson(bodyText));

  if (!resp.ok || data?.success === false) {
    throw new Error(firstString(data?.error, data?.message) || `OpenWA retornou HTTP ${resp.status}`);
  }

  return {
    provider: "openwa",
    contacts: Array.isArray(data?.data) ? data.data : [],
  };
}
