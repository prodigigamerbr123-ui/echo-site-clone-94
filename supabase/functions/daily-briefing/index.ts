import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function fmtBR(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFail = await requireUser(req);
  if (authFail) return authFail;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    // Compute Brasília day boundaries via Intl parts (evita bug de DST/toLocaleString)
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
    const yyyy = parts.year, mm = parts.month, dd = parts.day;
    // Brasília é UTC-3 fixo (sem DST desde 2019)
    const startOfDay = new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
    const endOfDay = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999-03:00`);

    const [
      studentsRes,
      evalsTodayRes,
      evalsOverdueRes,
      evalsWithStudentsRes,
      scheduledMsgsRes,
      sentTodayRes,
      birthdaysRes,
    ] = await Promise.all([
      supabase.from("students").select("id,status,had_evaluation,created_at,birth_date,name").limit(5000),
      supabase.from("evaluations").select("id,scheduled_at,student_id,status").eq("status", "scheduled").gte("scheduled_at", startOfDay.toISOString()).lte("scheduled_at", endOfDay.toISOString()),
      supabase.from("evaluations").select("id,scheduled_at,student_id,status").eq("status", "scheduled").lt("scheduled_at", startOfDay.toISOString()),
      supabase.from("evaluations").select("id,scheduled_at,status,students(name)").eq("status", "scheduled").gte("scheduled_at", startOfDay.toISOString()).lte("scheduled_at", endOfDay.toISOString()).order("scheduled_at", { ascending: true }).limit(20),
      supabase.from("scheduled_messages").select("id,scheduled_for,status").eq("status", "pending").gte("scheduled_for", startOfDay.toISOString()).lte("scheduled_for", endOfDay.toISOString()),
      supabase.from("messages").select("id,sent_at").gte("sent_at", startOfDay.toISOString()).lte("sent_at", endOfDay.toISOString()),
      supabase.from("students").select("name,birth_date").not("birth_date", "is", null).limit(5000),
    ]);

    const students = studentsRes.data || [];
    const active = students.filter((s: any) => s.status === "active").length;
    const withoutEval = students.filter((s: any) => s.had_evaluation === false).length;
    const birthdayList = (birthdaysRes.data || []).filter((s: any) => {
      if (!s.birth_date) return false;
      const [_, m, d] = s.birth_date.split("-");
      return m === mm && d === dd;
    }).map((s: any) => s.name);

    const evalNames = (evalsWithStudentsRes.data || []).map((e: any) => {
      const t = new Date(e.scheduled_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      return `${t} - ${e.students?.name || "?"}`;
    });

    const context = {
      dataHora: fmtBR(now),
      totalAlunos: students.length,
      alunosAtivos: active,
      alunosSemAvaliacao: withoutEval,
      avaliacoesHoje: evalsTodayRes.data?.length || 0,
      avaliacoesAtrasadas: evalsOverdueRes.data?.length || 0,
      agendaHoje: evalNames,
      mensagensAgendadasHoje: scheduledMsgsRes.data?.length || 0,
      mensagensEnviadasHoje: sentTodayRes.data?.length || 0,
      aniversariantes: birthdayList,
    };

    const systemPrompt = `Você é o JARVIS pessoal de um personal trainer. Estilo: elegante, direto, levemente formal com toques descontraídos, como o assistente do Homem de Ferro. Fale em português do Brasil, tratando o usuário como "Chefe" ou "senhor" ocasionalmente (não em toda frase).

Gere um briefing diário curto e útil em Markdown, com no máximo 4 seções curtas:
1. **Saudação & panorama** (1-2 frases mencionando data)
2. **Agenda de hoje** (avaliações, aniversariantes)
3. **Alertas** (atrasos, pendências importantes)
4. **Sugestão do dia** (1 ação recomendada priorizando o impacto)

Seja conciso (máx ~180 palavras). Use bullets. Se não houver nada em uma seção, omita. Nunca invente dados fora do contexto fornecido.`;

    const userPrompt = `Contexto atual do sistema (JSON):\n${JSON.stringify(context, null, 2)}\n\nGere o briefing diário.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      return new Response(JSON.stringify({ error: "ai_error", status: aiRes.status, detail: text }), {
        status: aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const briefing = data.choices?.[0]?.message?.content || "Sem briefing disponível.";

    return new Response(JSON.stringify({ briefing, context, generatedAt: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
