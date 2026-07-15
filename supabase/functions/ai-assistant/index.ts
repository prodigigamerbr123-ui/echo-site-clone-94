import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createEvaluationWithMessages,
  completeEvaluation,
  noShowEvaluation,
  checkScheduleConflicts,
} from "../_shared/evaluations.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// Ferramentas que MODIFICAM dados. Sempre exigem confirmação do usuário.
const WRITE_TOOLS = new Set([
  "schedule_evaluation",
  "complete_evaluation",
  "create_student",
  "schedule_message",
  "delete_scheduled_message",
  "create_predefined_message",
]);

const tools = [
  // ---------- READ ----------
  {
    type: "function",
    function: {
      name: "list_students",
      description: "Lista alunos cadastrados. Filtro opcional por nome.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Estatísticas gerais: total de alunos, mensagens enviadas hoje, agendadas pendentes, aniversariantes, alunos sem avaliação.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scheduled_messages",
      description: "Lista mensagens agendadas por status e período.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "sent", "failed", "all"] },
          from: { type: "string" },
          to: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sent_messages",
      description: "Histórico de mensagens enviadas.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
          student_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_predefined_messages",
      description: "Lista templates de mensagens pré-definidas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_whatsapp_status",
      description: "Verifica se o WhatsApp da academia está conectado.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_evaluations",
      description: "Lista compromissos de avaliação física (evaluations) com nome do aluno. Use para responder 'quais avaliações tenho amanhã/hoje/semana'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["scheduled", "completed", "no_show", "cancelled", "all"] },
          from: { type: "string", description: "ISO date inicial. Opcional." },
          to: { type: "string", description: "ISO date final. Opcional." },
          limit: { type: "number" },
        },
      },
    },
  },

  // ---------- WRITE (todas confirmadas) ----------
  {
    type: "function",
    function: {
      name: "schedule_evaluation",
      description: "Agenda uma avaliação física real (cria compromisso na tabela evaluations e as 3 mensagens automáticas). Verifica travas de duplicidade e conflito antes de criar. SEMPRE requer confirmação do usuário.",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          scheduled_at: { type: "string", description: "ISO datetime futuro." },
          notes: { type: "string" },
        },
        required: ["student_id", "scheduled_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_evaluation",
      description: "Fecha uma avaliação como realizada ou faltou. Atualiza had_evaluation/last_evaluation_date, deleta mensagens pendentes vinculadas e agenda follow-up (7d) ou remarcação (amanhã). SEMPRE requer confirmação.",
      parameters: {
        type: "object",
        properties: {
          evaluation_id: { type: "string" },
          outcome: { type: "string", enum: ["completed", "no_show"] },
        },
        required: ["evaluation_id", "outcome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_student",
      description: "Cadastra um novo aluno. SEMPRE requer confirmação.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string", description: "Formato (XX) XXXXX-XXXX" },
          birth_date: { type: "string", description: "YYYY-MM-DD. Opcional." },
          had_evaluation: { type: "boolean" },
        },
        required: ["name", "phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_message",
      description: "Agenda mensagem(ns) na fila do processador (com delay anti-ban). Aceita 1 ou vários alunos. Se o usuário disser 'envia agora', use scheduled_for = agora+2min. Se student_ids tiver mais de 20 alunos, as mensagens são espalhadas automaticamente ao longo de 1 hora. SEMPRE requer confirmação.",
      parameters: {
        type: "object",
        properties: {
          student_ids: { type: "array", items: { type: "string" } },
          content: { type: "string" },
          scheduled_for: { type: "string", description: "ISO datetime. Opcional — padrão agora+2min." },
          message_type: { type: "string", description: "Padrão 'manual'." },
        },
        required: ["student_ids", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_scheduled_message",
      description: "Cancela uma mensagem agendada. SEMPRE requer confirmação.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_predefined_message",
      description: "Cria template de mensagem pré-definida. SEMPRE requer confirmação.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
        },
        required: ["title", "content"],
      },
    },
  },
];

// ---------- helpers ----------

function fmtBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function studentName(supabase: any, id: string): Promise<string> {
  const { data } = await supabase.from("students").select("name").eq("id", id).single();
  return data?.name ?? "aluno";
}

// Descrição legível pro card de confirmação
async function describeWriteAction(name: string, args: any, supabase: any): Promise<string> {
  switch (name) {
    case "schedule_evaluation": {
      const n = await studentName(supabase, args.student_id);
      return `Agendar avaliação de ${n} para ${fmtBR(args.scheduled_at)} (com 3 mensagens automáticas: confirmação, véspera 18h e 3h antes).`;
    }
    case "complete_evaluation": {
      const { data } = await supabase.from("evaluations").select("scheduled_at, students(name)").eq("id", args.evaluation_id).single();
      const n = data?.students?.name ?? "aluno";
      const when = data?.scheduled_at ? fmtBR(data.scheduled_at) : "";
      if (args.outcome === "completed") {
        return `Marcar avaliação de ${n} (${when}) como REALIZADA. Isso apaga lembretes pendentes e agenda follow-up para 7 dias.`;
      }
      return `Marcar avaliação de ${n} (${when}) como FALTOU. Isso apaga lembretes pendentes e agenda mensagem de remarcação para amanhã.`;
    }
    case "create_student": {
      return `Cadastrar novo aluno: ${args.name} — ${args.phone}${args.birth_date ? ` (nasc. ${args.birth_date})` : ""}.`;
    }
    case "schedule_message": {
      const ids: string[] = args.student_ids || [];
      const when = args.scheduled_for ? fmtBR(args.scheduled_for) : "próximos 2 minutos";
      const spread = ids.length > 20 ? " (espalhado ao longo de 1 hora)" : "";
      return `Enfileirar mensagem para ${ids.length} aluno(s), a partir de ${when}${spread}.\n\nTexto: "${(args.content || "").slice(0, 200)}${(args.content || "").length > 200 ? "..." : ""}"`;
    }
    case "delete_scheduled_message": {
      return `Cancelar mensagem agendada (id: ${args.id}).`;
    }
    case "create_predefined_message": {
      return `Criar mensagem pré-definida "${args.title}".`;
    }
    default:
      return `Executar ${name}.`;
  }
}

// ---------- executor ----------

async function executeTool(name: string, args: any, supabase: any): Promise<any> {
  console.log(`[tool] ${name}`, JSON.stringify(args).slice(0, 300));
  switch (name) {
    // READ
    case "list_students": {
      let q = supabase.from("students").select("id, name, phone, birth_date, had_evaluation, last_evaluation_date, created_at").order("name");
      if (args.search) q = q.ilike("name", `%${args.search}%`);
      q = q.limit(args.limit || 50);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length || 0, students: data };
    }
    case "get_dashboard_stats": {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
      const [{ count: totalStudents }, { count: sentToday }, { count: pendingScheduled }, { data: allStudents }] = await Promise.all([
        supabase.from("students").select("*", { count: "exact", head: true }),
        supabase.from("messages").select("*", { count: "exact", head: true }).gte("sent_at", todayStart.toISOString()).lte("sent_at", todayEnd.toISOString()),
        supabase.from("scheduled_messages").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("students").select("name, birth_date, had_evaluation").not("birth_date", "is", null),
      ]);
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const birthdays = (allStudents || []).filter((s: any) => {
        if (!s.birth_date) return false;
        const [, m, d] = s.birth_date.split("-");
        return m === mm && d === dd;
      }).map((s: any) => s.name);
      const semAvaliacao = (allStudents || []).filter((s: any) => !s.had_evaluation).length;
      return { totalStudents, messagesSentToday: sentToday, pendingScheduledMessages: pendingScheduled, birthdaysToday: birthdays, studentsWithoutEvaluation: semAvaliacao };
    }
    case "list_scheduled_messages": {
      let q = supabase.from("scheduled_messages").select("id, content, scheduled_for, status, message_type, students(name, phone)").order("scheduled_for", { ascending: true });
      if (args.status && args.status !== "all") q = q.eq("status", args.status);
      if (args.from) q = q.gte("scheduled_for", args.from);
      if (args.to) q = q.lte("scheduled_for", args.to);
      q = q.limit(args.limit || 30);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length || 0, messages: data };
    }
    case "list_sent_messages": {
      let q = supabase.from("messages").select("id, content, sent_at, status, students(name, phone)").order("sent_at", { ascending: false });
      q = q.limit(args.limit || 30);
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data;
      if (args.student_name) {
        filtered = (data || []).filter((m: any) => m.students?.name?.toLowerCase().includes(args.student_name.toLowerCase()));
      }
      return { count: filtered?.length || 0, messages: filtered };
    }
    case "list_predefined_messages": {
      const { data, error } = await supabase.from("predefined_messages").select("id, title, content").order("title");
      if (error) throw error;
      return { count: data?.length || 0, messages: data };
    }
    case "get_whatsapp_status": {
      const { data, error } = await supabase.functions.invoke("whatsapp-status");
      if (error) return { connected: false, error: error.message };
      return data;
    }
    case "list_evaluations": {
      let q = supabase.from("evaluations")
        .select("id, scheduled_at, status, notes, completed_at, students(name, phone)")
        .order("scheduled_at", { ascending: true });
      if (args.status && args.status !== "all") q = q.eq("status", args.status);
      if (args.from) q = q.gte("scheduled_at", args.from);
      if (args.to) q = q.lte("scheduled_at", args.to);
      q = q.limit(args.limit || 50);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length || 0, evaluations: data };
    }

    // WRITE
    case "schedule_evaluation": {
      const when = new Date(args.scheduled_at);
      if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return { success: false, error: "scheduled_at deve ser uma data futura válida (ISO)." };
      }
      const check = await checkScheduleConflicts(supabase, args.student_id, when);
      if (check.duplicate) {
        return {
          success: false,
          blocked: "duplicate",
          message: `Este aluno já tem avaliação agendada para ${fmtBR(check.duplicate.scheduled_at)}. Cancele ou remarque a existente antes de criar outra.`,
        };
      }
      if (check.conflict) {
        return {
          success: false,
          blocked: "conflict",
          message: `Já existe avaliação de ${check.conflict.student_name} às ${fmtBR(check.conflict.scheduled_at)} (raio de 30 min). Escolha outro horário.`,
        };
      }
      const res = await createEvaluationWithMessages(supabase, args.student_id, when, args.notes ?? null);
      return { success: true, ...res };
    }
    case "complete_evaluation": {
      if (args.outcome === "completed") {
        const r = await completeEvaluation(supabase, args.evaluation_id);
        return { success: true, outcome: "completed", ...r };
      }
      if (args.outcome === "no_show") {
        await noShowEvaluation(supabase, args.evaluation_id);
        return { success: true, outcome: "no_show" };
      }
      return { success: false, error: "outcome inválido" };
    }
    case "create_student": {
      const { data, error } = await supabase.from("students").insert({
        name: args.name, phone: args.phone, birth_date: args.birth_date || null, had_evaluation: args.had_evaluation || false,
      }).select().single();
      if (error) throw error;
      return { success: true, student: data };
    }
    case "schedule_message": {
      const ids: string[] = args.student_ids || [];
      if (!ids.length) return { success: false, error: "student_ids vazio" };
      const base = args.scheduled_for ? new Date(args.scheduled_for) : new Date(Date.now() + 2 * 60 * 1000);
      if (isNaN(base.getTime())) return { success: false, error: "scheduled_for inválido" };
      const spread = ids.length > 20;
      const spanMs = spread ? 60 * 60 * 1000 : 0;
      const rows = ids.map((sid, i) => {
        const offset = spread
          ? Math.floor((spanMs / (ids.length - 1)) * i) + Math.floor(Math.random() * 30000)
          : ids.length > 1
            ? Math.floor(Math.random() * (i + 1) * 60 * 1000) // pequeno jitter para múltiplos
            : 0;
        return {
          student_id: sid,
          content: args.content,
          scheduled_for: new Date(base.getTime() + offset).toISOString(),
          message_type: args.message_type || "manual",
          status: "pending",
        };
      });
      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) throw error;
      return { success: true, enqueued: rows.length, spread_over_minutes: spread ? 60 : 0 };
    }
    case "delete_scheduled_message": {
      const { error } = await supabase.from("scheduled_messages").delete().eq("id", args.id);
      if (error) throw error;
      return { success: true };
    }
    case "create_predefined_message": {
      const { data, error } = await supabase.from("predefined_messages").insert({ title: args.title, content: args.content }).select().single();
      if (error) throw error;
      return { success: true, predefined: data };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

const SYSTEM_PROMPT = `Você é o assistente do "Academia Workout" — SaaS de gestão que envia mensagens automáticas por WhatsApp (Evolution API).

TABELAS PRINCIPAIS:
- students: alunos (name, phone, birth_date, had_evaluation, last_evaluation_date, status).
- evaluations: COMPROMISSOS reais de avaliação física (id, student_id, scheduled_at, status: scheduled/completed/no_show/cancelled). Cada avaliação agendada gera automaticamente 3 mensagens (confirmação, véspera 18h, dia -3h).
- scheduled_messages: fila de envio. status pending/processing/sent/failed. evaluation_id vincula às automáticas de avaliação.
- messages: histórico de mensagens já enviadas.
- predefined_messages: templates.

FLUXO DE AVALIAÇÃO (fonte da verdade):
1. Agendar (schedule_evaluation) → cria evaluation 'scheduled' + até 3 mensagens automáticas na fila. Trava se o aluno já tem avaliação futura ou se há outro compromisso no mesmo horário (raio 30 min).
2. No dia: usar complete_evaluation com outcome='completed' (realizada, agenda follow-up 7d) ou 'no_show' (faltou, agenda remarcação amanhã).
3. Cancelar/remarcar hoje só é feito pela agenda (/agendar-avaliacao).

FILA DE ENVIO: nunca envia em rajada. schedule_message sempre coloca na fila com delay anti-ban. Se >20 alunos, o próprio backend espalha ao longo de 1 hora. Para "envia agora", basta omitir scheduled_for.

REGRAS DE COMPORTAMENTO:
- Use ferramentas para dados reais. Nunca invente nomes, horários ou contagens.
- Para ferramentas de LEITURA (list_*, get_*): execute direto.
- Para ferramentas de ESCRITA (schedule_evaluation, complete_evaluation, create_student, schedule_message, delete_scheduled_message, create_predefined_message): você NÃO executa direto — o sistema intercepta, mostra um card de confirmação ao usuário e só executa se ele autorizar. Portanto: chame a ferramenta normalmente com os argumentos corretos; o usuário verá o resumo e decidirá. Depois de chamar, apenas explique brevemente o que pediu para confirmar.
- Se uma ferramenta de escrita retornar { blocked: 'duplicate' | 'conflict' }, explique o motivo ao usuário e ofereça alternativa (remarcar, escolher outro horário) — não insista.
- Português claro e curto. Markdown com moderação. Emojis raros.`;

// Envelope da resposta:
//   { message: string, pendingAction?: { tool, args, description, id } }
// Se pendingAction presente, o front renderiza card e reenvia com body.confirmedAction.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = await req.json();
    const clientMessages = body.messages || [];
    const confirmedAction = body.confirmedAction as { tool: string; args: any } | undefined;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Se veio uma ação já confirmada, executa direto e retorna mensagem sintetizada.
    if (confirmedAction && WRITE_TOOLS.has(confirmedAction.tool)) {
      let result: any;
      try {
        result = await executeTool(confirmedAction.tool, confirmedAction.args, supabase);
      } catch (e: any) {
        return new Response(JSON.stringify({
          message: `❌ Não consegui executar: ${e?.message || "erro"}.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Pede ao modelo uma resposta curta com base no resultado
      const summarizeResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...clientMessages,
            { role: "assistant", content: `Ação "${confirmedAction.tool}" executada com resultado: ${JSON.stringify(result).slice(0, 800)}` },
            { role: "user", content: "Escreva UMA resposta curta em português confirmando ao usuário o que foi feito (ou o erro/bloqueio, se houver). Não chame ferramentas." },
          ],
        }),
      });
      let finalMsg = "✅ Feito.";
      if (summarizeResp.ok) {
        const d = await summarizeResp.json();
        finalMsg = d.choices?.[0]?.message?.content || finalMsg;
      }
      return new Response(JSON.stringify({ message: finalMsg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...clientMessages,
    ];

    for (let i = 0; i < 6; i++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
          tools,
        }),
      });

      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente de novo em alguns instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione créditos em Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("AI gateway error:", resp.status, txt);
        return new Response(JSON.stringify({ error: "Erro no AI Gateway", details: txt.slice(0, 500) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) {
        return new Response(JSON.stringify({ message: "Não recebi resposta do modelo. Reformule a pergunta." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      messages.push(msg);
      const toolCalls = msg.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return new Response(JSON.stringify({ message: msg.content || "..." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Se alguma tool_call for de escrita, INTERROMPE aqui e devolve pendingAction ao front.
      const writeCall = toolCalls.find((tc: any) => WRITE_TOOLS.has(tc.function?.name));
      if (writeCall) {
        let args: any = {};
        try { args = JSON.parse(writeCall.function.arguments || "{}"); } catch {}
        const description = await describeWriteAction(writeCall.function.name, args, supabase);
        const preface = (msg.content && typeof msg.content === "string" && msg.content.trim())
          ? msg.content
          : "Antes de executar, preciso da sua confirmação:";
        return new Response(JSON.stringify({
          message: preface,
          pendingAction: {
            id: writeCall.id,
            tool: writeCall.function.name,
            args,
            description,
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Só tools de leitura — executa e continua o loop
      for (const tc of toolCalls) {
        let result: any;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          result = await executeTool(tc.function.name, args, supabase);
        } catch (e: any) {
          console.error(`Tool ${tc.function.name} error:`, e);
          result = { error: e?.message || "tool error" };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return new Response(JSON.stringify({ message: "Não consegui concluir a tarefa. Reformule?" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: "Erro interno", details: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
