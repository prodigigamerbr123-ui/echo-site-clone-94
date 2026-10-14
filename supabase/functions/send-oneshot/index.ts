import { corsHeaders, requireCronSecret } from "../_shared/auth.ts";
import { sendEvolutionText } from "../_shared/evolution.ts";
import { formatPhone } from "../_shared/phone.ts";
import { inputErrorResponse, readJsonObject } from "../_shared/httpInput.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

// Internal diagnostic endpoint. Interactive application sends use the durable queue.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const fail = requireCronSecret(req);
  if (fail) return fail;
  try {
    const { phone, text } = await readJsonObject(req, 8192);
    if (typeof phone !== "string" || phone.length > 40 ||
        typeof text !== "string" || !text.trim() || text.trim().length > 1000) {
      return json({ error: "Informe um telefone e uma mensagem de 1 a 1000 caracteres" }, 400);
    }
    const pc = formatPhone(phone);
    if (!pc.ok) return json({ error: pc.reason }, 400);
    const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const instanceToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
    if (!baseUrl || !instanceToken) return json({ error: "Evolution API não configurada" }, 500);
    const result = await sendEvolutionText({ baseUrl, instanceToken, number: pc.number, text: text.trim() });
    return json({
      ok: result.ok, uncertain: result.uncertain ?? false,
      httpStatus: result.httpStatus, messageId: result.messageId,
      ...(result.ok ? {} : { reason: result.reason }),
    }, result.ok ? 200 : 502);
  } catch (error) {
    const invalid = inputErrorResponse(error, corsHeaders);
    if (invalid) return invalid;
    console.error("send-oneshot failed");
    return json({ ok: false, uncertain: true, error: "Não foi possível confirmar o envio. Confira o WhatsApp antes de tentar novamente." }, 502);
  }
});
