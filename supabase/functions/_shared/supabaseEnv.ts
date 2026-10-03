type KeyMap = Record<string, unknown>;

function readDefaultKey(envName: string): string | undefined {
  const raw = Deno.env.get(envName);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as KeyMap;
    const preferred = parsed.default;
    if (typeof preferred === "string" && preferred.trim()) return preferred;

    for (const value of Object.values(parsed)) {
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    // New Supabase key variables are JSON maps. Ignore malformed values here
    // so the legacy fallback can still work in older/self-hosted environments.
  }

  return undefined;
}

export function getSupabasePublishableKey(): string {
  const key =
    readDefaultKey("SUPABASE_PUBLISHABLE_KEYS") ||
    Deno.env.get("SUPABASE_ANON_KEY")?.trim();

  if (!key) {
    throw new Error("Chave pública do Supabase não disponível no ambiente");
  }
  return key;
}

export function getSupabaseSecretKey(): string {
  const key =
    readDefaultKey("SUPABASE_SECRET_KEYS") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!key) {
    throw new Error("Chave secreta do Supabase não disponível no ambiente");
  }
  return key;
}
