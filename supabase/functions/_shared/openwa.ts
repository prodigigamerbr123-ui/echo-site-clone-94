export interface OpenWaSendResult {
  ok: boolean;
  httpStatus?: number;
  messageId?: string | null;
  reason?: string;
  bodyText?: string;
}

export class OpenWaHttpError extends Error {
  httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "OpenWaHttpError";
    this.httpStatus = httpStatus;
  }
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

function headers(apiKey?: string): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey?.trim()) {
    const key = apiKey.trim();
    // v4 accepts api_key; current OpenWA documents X-API-Key. Sending both
    // keeps this integration compatible while the VM remains on stable v4.
    result.api_key = key;
    result["X-API-Key"] = key;
  }
  return result;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function callOpenWa(
  baseUrl: string,
  endpoint: string,
  apiKey: string | undefined,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; httpStatus: number; data: any; bodyText: string; reason?: string }> {
  const resp = await fetch(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(Object.keys(args).length > 0 ? { args } : {}),
  });

  const bodyText = await resp.text();
  const data = safeJson(bodyText);
  const apiError = extractError(data);

  if (!resp.ok || data?.success === false) {
    return {
      ok: false,
      httpStatus: resp.status,
      data,
      bodyText,
      reason: apiError || `OpenWA retornou HTTP ${resp.status}`,
    };
  }

  return { ok: true, httpStatus: resp.status, data, bodyText };
}

export async function logoutOpenWa(
  baseUrl: string,
  apiKey?: string,
): Promise<void> {
  const result = await callOpenWa(baseUrl, "logout", apiKey, {
    preserveSessionData: false,
  });

  if (!result.ok) {
    throw new OpenWaHttpError(
      result.reason || "Não foi possível desconectar o WhatsApp do OpenWA",
      result.httpStatus,
    );
  }
}

function unwrapSerializedId(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?._serialized === "string") return value._serialized;
  if (typeof value?.id === "string") return value.id;
  if (typeof value?.user === "string" && typeof value?.server === "string") {
    return `${value.user}@${value.server}`;
  }
  return null;
}

function digitsFromWaId(value: any): string | null {
  const serialized = unwrapSerializedId(value);
  if (!serialized) return null;
  const user = serialized.split("@")[0]?.replace(/\D/g, "");
  return user || null;
}

function brazilianLegacyAlias(number: string): string | null {
  // Brazilian mobile JIDs created before the ninth-digit migration may still
  // be stored by WhatsApp without the extra 9 after DDI + DDD.
  if (!/^55\d{2}9\d{8}$/.test(number)) return null;
  return `${number.slice(0, 4)}${number.slice(5)}`;
}

let contactsCache: { expiresAt: number; contacts: any[] } | null = null;

async function getCachedContacts(baseUrl: string, apiKey?: string): Promise<any[]> {
  const now = Date.now();
  if (contactsCache && contactsCache.expiresAt > now) return contactsCache.contacts;

  const contacts = await getOpenWaContacts(baseUrl, apiKey);
  contactsCache = { expiresAt: now + 60_000, contacts };
  return contacts;
}

function findSavedContactId(contacts: any[], numbers: string[]): string | null {
  const wanted = new Set(numbers);

  for (const contact of contacts) {
    const candidates = [contact?.id, contact?.phoneNumber, contact?.wid, contact?.lid];
    const matches = candidates.some((value) => {
      const digits = digitsFromWaId(value);
      return digits ? wanted.has(digits) : false;
    });

    if (!matches) continue;

    // Prefer a classic @c.us identifier because it is accepted by sendText
    // across OpenWA versions; fall back to any serialized contact id.
    const serialized = candidates.map(unwrapSerializedId).filter(Boolean) as string[];
    return serialized.find((id) => /@c\.us$/i.test(id)) || serialized[0] || null;
  }

  return null;
}

export async function getOpenWaState(
  baseUrl: string,
  apiKey?: string,
): Promise<"open" | "connecting" | "close" | "unknown"> {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  // v5 exposes a public readiness endpoint that is more reliable than the
  // legacy WAPI getConnectionState method.
  try {
    const healthResponse = await fetch(`${normalizedBaseUrl}/health`, {
      method: "GET",
    });
    if (healthResponse.ok) {
      const health = safeJson(await healthResponse.text());
      if (health?.connected === true && health?.session?.ready !== false) return "open";
      if (health?.connected === false || health?.session?.ready === false) return "connecting";
    }
  } catch (_) {
    // Legacy v4 deployments do not expose /health.
  }

  // Stable v4.76.0 fallback. getState/getConnectionState/getMe currently
  // fail against recent WhatsApp Web internals, while isConnected remains
  // available and does not mutate the session.
  try {
    const result = await callOpenWa(normalizedBaseUrl, "isConnected", apiKey, {});
    if (result.ok && result.data?.response === true) return "open";
    if (result.ok && result.data?.response === false) return "connecting";
    if (result.httpStatus === 401 || result.httpStatus === 403) return "unknown";
    return "close";
  } catch (_) {
    return "unknown";
  }
}

async function resolveRecipient(
  baseUrl: string,
  apiKey: string | undefined,
  number: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const requestedId = `${number}@c.us`;
  const legacy = brazilianLegacyAlias(number);
  const aliases = legacy ? [number, legacy] : [number];

  try {
    // OpenWA Community can refuse starting a chat with a number that is not a
    // saved contact. Resolve against the local WhatsApp address book first so
    // Brazilian legacy JIDs (without the ninth digit) keep working.
    try {
      const contacts = await getCachedContacts(baseUrl, apiKey);
      const savedId = findSavedContactId(contacts, aliases);
      if (savedId) return { ok: true, id: savedId };
    } catch (error) {
      console.warn("[openwa-send] contact lookup failed; falling back to checkNumberStatus", error);
    }

    const result = await callOpenWa(baseUrl, "checkNumberStatus", apiKey, {
      contactId: requestedId,
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason || "Falha ao validar número no OpenWA" };
    }

    const status = result.data?.response ?? result.data;
    if (status?.numberExists === false || status?.canReceiveMessage === false) {
      return { ok: false, reason: "Número não pode receber mensagens no WhatsApp" };
    }

    const resolved =
      unwrapSerializedId(status?.id) ||
      unwrapSerializedId(status?.wid) ||
      unwrapSerializedId(status?.contactId) ||
      unwrapSerializedId(status?.lid) ||
      requestedId;

    return { ok: true, id: resolved };
  } catch (error: any) {
    return { ok: false, reason: error?.message || "Falha ao validar número no OpenWA" };
  }
}

export async function sendOpenWaText(params: {
  baseUrl: string;
  apiKey?: string;
  number: string;
  text: string;
}): Promise<OpenWaSendResult> {
  const recipient = await resolveRecipient(params.baseUrl, params.apiKey, params.number);
  if (recipient.ok === false) return { ok: false, reason: recipient.reason };

  const result = await callOpenWa(params.baseUrl, "sendText", params.apiKey, {
    to: recipient.id,
    content: params.text,
  });

  const response = result.data?.response;
  const messageId =
    typeof response === "string"
      ? response
      : unwrapSerializedId(response?.id) || unwrapSerializedId(response) || null;

  console.log(
    `[openwa-send] http=${result.httpStatus} recipient=${recipient.id} messageId=${messageId || "none"} body=${result.bodyText.slice(0, 500)}`,
  );

  if (!result.ok) {
    return {
      ok: false,
      httpStatus: result.httpStatus,
      reason: result.reason || "OpenWA recusou o envio",
      bodyText: result.bodyText,
    };
  }

  return {
    ok: true,
    httpStatus: result.httpStatus,
    messageId,
    bodyText: result.bodyText,
  };
}

export async function getOpenWaContacts(baseUrl: string, apiKey?: string): Promise<any[]> {
  const result = await callOpenWa(baseUrl, "getAllContacts", apiKey, {});
  if (!result.ok) throw new Error(result.reason || "Falha ao listar contatos no OpenWA");
  return Array.isArray(result.data?.response) ? result.data.response : [];
}

export async function getOpenWaQr(
  baseUrl: string,
  apiKey?: string,
  sessionId = "workout",
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/qr?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: headers(apiKey),
  });

  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`OpenWA QR retornou HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:${contentType.split(";")[0]};base64,${bytesToBase64(bytes)}`;
  }

  const text = (await response.text()).trim();
  if (!text) return null;
  if (text.startsWith("data:image/")) return text;

  try {
    const data = JSON.parse(text);
    const qr = data?.qr ?? data?.response?.qr ?? data?.response;
    return typeof qr === "string" && qr.startsWith("data:image/") ? qr : null;
  } catch (_) {
    return null;
  }
}
