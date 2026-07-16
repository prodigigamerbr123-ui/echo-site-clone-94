export interface EvolutionInstance {
  name?: string;
  connectionStatus?: string;
  disconnectionReasonCode?: number | string | null;
  disconnectionObject?: unknown;
}

export async function fetchEvolutionInstances(
  baseUrl: string,
  headers: HeadersInit,
): Promise<{ status: number; instances: EvolutionInstance[] }> {
  const response = await fetch(`${baseUrl}/instance/fetchInstances`, { headers });
  const text = await response.text();
  let parsed: unknown = [];

  try {
    parsed = JSON.parse(text);
  } catch (_) {
    parsed = [];
  }

  return {
    status: response.status,
    instances: Array.isArray(parsed) ? parsed as EvolutionInstance[] : [],
  };
}

export function getEvolutionInstance(
  instances: EvolutionInstance[],
  instanceName: string,
): EvolutionInstance | undefined {
  return instances.find((instance) => instance.name === instanceName) || instances[0];
}

export function hasRemovedDevice(instance?: EvolutionInstance): boolean {
  if (!instance) return false;

  const reasonCode = Number(instance.disconnectionReasonCode || 0);
  const rawDisconnection = typeof instance.disconnectionObject === "string"
    ? instance.disconnectionObject
    : JSON.stringify(instance.disconnectionObject || "");
  const detail = `${instance.connectionStatus || ""} ${rawDisconnection}`.toLowerCase();

  return reasonCode === 401 || detail.includes("device_removed");
}

export function summarizeWhatsAppConnection(
  state: string,
  instance?: EvolutionInstance,
): {
  effectiveState: string;
  connected: boolean;
  staleSession: boolean;
  disconnectionReason: string | null;
} {
  const staleSession = hasRemovedDevice(instance);
  const effectiveState = staleSession ? "close" : state;

  return {
    effectiveState,
    connected: effectiveState === "open" && !staleSession,
    staleSession,
    disconnectionReason: staleSession ? "device_removed" : null,
  };
}