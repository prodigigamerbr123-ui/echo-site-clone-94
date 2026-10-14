/** Vite exposes VITE_* values to the browser. Never accept server credentials. */
export function assertPublicFrontendEnv(env: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(env)) {
    if (value && name.startsWith("VITE_") &&
        /SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL|EVOLUTION.*TOKEN|GEMINI.*KEY|GOOGLE.*KEY/.test(name)) {
      throw new Error("Configuração privada detectada em uma variável VITE_. Remova-a antes de gerar o site.");
    }
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Configure a chave pública do backend antes de gerar o site.");
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) return;
  try {
    const parts = key.split(".");
    if (parts.length !== 3) throw new Error();
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    if (payload && typeof payload === "object" && "role" in payload && payload.role === "anon") return;
  } catch {
    // Do not include the value or decoded payload in errors or build logs.
  }
  throw new Error("Use somente uma chave pública anon ou publishable no frontend.");
}
