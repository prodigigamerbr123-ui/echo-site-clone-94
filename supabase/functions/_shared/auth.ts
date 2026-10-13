import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabasePublishableKey } from "./supabaseEnv.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Validates the Authorization: Bearer <jwt> header via Supabase getClaims.
 * Returns a 401 Response on failure, or null on success.
 */
export async function requireUser(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getSupabasePublishableKey(),
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

export type StaffRole = "admin" | "recepcao" | "avaliador";

/** Requires an active staff membership after validating the caller's JWT. */
export async function requireStaffRole(req: Request, allowed: readonly StaffRole[]): Promise<Response | null> {
  const authError = await requireUser(req);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getSupabasePublishableKey(),
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
  const { data, error } = await supabase.rpc("current_staff_role");
  if (error) {
    console.error("Unable to resolve staff role:", error.message);
    return new Response(JSON.stringify({ error: "Permissões indisponíveis" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!data || !allowed.includes(data as StaffRole)) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Validates the x-cron-secret header against the CRON_SECRET env var.
 * Returns 500 if the server is misconfigured, 401 if the secret is missing/wrong,
 * or null on success.
 */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return new Response(JSON.stringify({ error: "CRON_SECRET não configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Secrets in URLs can leak through access logs, browser history and referrers.
  const provided = req.headers.get("x-cron-secret") || "";
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}
