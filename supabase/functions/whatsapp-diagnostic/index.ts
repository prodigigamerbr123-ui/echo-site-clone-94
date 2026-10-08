import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, requireUser } from "../_shared/auth.ts";
import { getEvolutionState } from "../_shared/evolution.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFail = await requireUser(req);
  if (authFail) return authFail;

  try {
    const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const instanceToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
    if (!baseUrl || !instanceToken) {
      return new Response(JSON.stringify({ error: "Evolution API não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = await getEvolutionState(baseUrl, instanceToken);
    return new Response(
      JSON.stringify({
        provider: "evolution",
        instance: "workout",
        state,
        connected: state === "open",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("whatsapp-diagnostic error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
