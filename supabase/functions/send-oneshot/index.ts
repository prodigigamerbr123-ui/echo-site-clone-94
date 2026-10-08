import { corsHeaders, requireCronSecret } from "../_shared/auth.ts";
import { sendEvolutionText } from "../_shared/evolution.ts";
import { formatPhone } from "../_shared/phone.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const fail = requireCronSecret(req);
  if (fail) return fail;
  try {
    const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const instanceToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
    if (!baseUrl || !instanceToken) {
      return new Response(JSON.stringify({ error: "Evolution API não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { phone, text } = await req.json();
    const pc = formatPhone(phone);
    if (!pc.ok) return new Response(JSON.stringify({ error: pc.reason }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const r = await sendEvolutionText({ baseUrl, instanceToken, number: pc.number, text });
    return new Response(JSON.stringify(r), { status: r.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
