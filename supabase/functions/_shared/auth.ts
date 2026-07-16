// Helpers de autenticação para edge functions.
// - requireUser: valida JWT do usuário logado (chamadas do frontend)
// - requireCronSecret: valida header x-cron-secret (chamadas de pg_cron)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function unauthorized(msg = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Exige um JWT válido de usuário logado no header Authorization.
 * Retorna a Response de erro (401) ou null se ok.
 */
export async function requireUser(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return unauthorized();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return unauthorized();
    return null;
  } catch {
    return unauthorized();
  }
}

/**
 * Exige o header x-cron-secret igual ao segredo CRON_SECRET.
 * Usado pelas edge functions chamadas pelo pg_cron.
 */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const got = req.headers.get("x-cron-secret");
  if (got !== expected) return unauthorized();
  return null;
}
