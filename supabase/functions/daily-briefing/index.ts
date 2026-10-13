import type { Database } from "../_shared/database.types.ts";
import { getAIProvider } from "../_shared/aiProvider.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffRole } from "../_shared/auth.ts";
import { getSupabasePublishableKey } from "../_shared/supabaseEnv.ts";

import { dashboardSnapshot, briefingContext } from "../_shared/dashboardContracts.ts";
import { modelMessage } from "../_shared/aiContracts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const aiProvider = getAIProvider("google/gemini-2.5-flash");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFail = await requireStaffRole(req, ["admin", "recepcao"]);
  if (authFail) return authFail;

  try {
    const supabase = createClient<Database>(SUPABASE_URL, getSupabasePublishableKey(), {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const { data: snapshotData, error: snapshotError } = await supabase.rpc("get_workout_dashboard");
    if (snapshotError) throw snapshotError;
    const snapshot = dashboardSnapshot(snapshotData);
    const context = briefingContext(snapshot);

    const systemPrompt = `Você é o JARVIS pessoal de um personal trainer. Estilo: elegante, direto, levemente formal com toques descontraídos, como o assistente do Homem de Ferro. Fale em português do Brasil, tratando o usuário como "Chefe" ou "senhor" ocasionalmente (não em toda frase).

Gere um briefing diário curto e útil em Markdown, com no máximo 4 seções curtas:
1. **Saudação & panorama** (1-2 frases mencionando data)
2. **Agenda de hoje** (avaliações, aniversariantes)
3. **Alertas** (atrasos, pendências importantes)
4. **Sugestão do dia** (1 ação recomendada priorizando o impacto)

Seja conciso (máx ~180 palavras). Use bullets. Se não houver nada em uma seção, omita. Nunca invente dados fora do contexto fornecido.`;

    const userPrompt = `Contexto atual do sistema (JSON):\n${JSON.stringify(context, null, 2)}\n\nGere o briefing diário.`;

    const aiRes = await fetch(aiProvider.url, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiProvider.apiKey}`,
      },
      body: JSON.stringify({
        model: aiProvider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      await aiRes.body?.cancel();
      return new Response(JSON.stringify({ error: "Não foi possível gerar o briefing agora.", status: aiRes.status }), {
        status: aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const briefing = modelMessage(data)?.content;
    if (!briefing?.trim()) throw new Error("Invalid briefing response");

    return new Response(JSON.stringify({ briefing, context, generatedAt: snapshot.generatedAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Não foi possível consultar os dados e gerar o briefing. Tente novamente." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
