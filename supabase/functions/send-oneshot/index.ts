import { corsHeaders, requireCronSecret } from "../_shared/auth.ts";
import { sendOpenWaText } from "../_shared/openwa.ts";
import { formatPhone } from "../_shared/phone.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const fail = requireCronSecret(req);
  if (fail) return fail;
  try {
    const baseUrl = Deno.env.get("OPENWA_API_URL")?.replace(/\/$/, "");
    const apiKey = Deno.env.get("OPENWA_API_KEY");
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "OpenWA API não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { phone, text } = await req.json();
    const pc = formatPhone(phone);
    if (!pc.ok) return new Response(JSON.stringify({ error: pc.reason }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const r = await sendOpenWaText({ baseUrl, apiKey, number: pc.number, text });
    return new Response(JSON.stringify(r), { status: r.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
