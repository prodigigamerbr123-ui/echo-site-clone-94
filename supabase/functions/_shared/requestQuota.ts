import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./auth.ts";
import { getSupabasePublishableKey } from "./supabaseEnv.ts";

type Operation = "ai-assistant" | "daily-briefing" | "ai-database-actions" | "send-whatsapp";

/** Database upserts serialize counters across concurrent Edge Runtime instances. */
export async function requireRequestQuota(req: Request, operation: Operation): Promise<Response | null> {
  const unavailable = () => new Response(JSON.stringify({ error: "Controle de solicitações indisponível. Tente novamente." }), {
    status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, getSupabasePublishableKey(), {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const { data, error } = await client.rpc("consume_staff_request_quota", { _operation: operation });
    if (error || !Number.isInteger(data) || data < 0 || data > 86400) return unavailable();
    if (data === 0) return null;
    return new Response(JSON.stringify({ error: "Limite de solicitações atingido. Tente novamente mais tarde.", retryAfter: data }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(data) },
    });
  } catch {
    return unavailable();
  }
}
