import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, requireCronSecret } from "../_shared/auth.ts";
import { sendEvolutionText } from "../_shared/evolution.ts";
import { formatPhone } from "../_shared/phone.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const fail = requireCronSecret(req);
  if (fail) return fail;
  try {
    const { phone, text } = await req.json();
    const pc = formatPhone(phone);
    if (!pc.ok) return new Response(JSON.stringify({ error: pc.reason }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const baseUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const token = Deno.env.get("EVOLUTION_INSTANCE_TOKEN")!;
    const r = await sendEvolutionText({ baseUrl, instanceToken: token, number: pc.number, text });

    // Log em public.messages (mesma tabela usada por send-whatsapp)
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Tenta localizar aluno pelo telefone (com e sem formatação) para satisfazer NOT NULL
      const digits = String(phone).replace(/\D/g, "");
      const { data: students } = await supabase
        .from("students")
        .select("id, phone")
        .limit(50);
      const match = (students ?? []).find(
        (s: any) => String(s.phone ?? "").replace(/\D/g, "").endsWith(digits) ||
                    digits.endsWith(String(s.phone ?? "").replace(/\D/g, "")),
      );
      if (match) {
        await supabase.from("messages").insert({
          student_id: match.id,
          content: text,
          status: r.ok ? "sent" : "failed",
        });
      } else {
        console.warn("send-oneshot: nenhum aluno encontrado para o telefone, não foi possível registrar em messages");
      }
    } catch (logErr) {
      console.error("send-oneshot: falha ao registrar mensagem:", logErr);
    }

    return new Response(JSON.stringify(r), { status: r.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
