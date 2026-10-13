import {
  chatUuid,
  chatHistory,
  recentChatContext,
  type ActionState,
} from "../_shared/aiChatContracts.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import { isRecord, record, errorMessage } from "../_shared/contracts.ts";
import {
  parseToolAction,
  clientHistory,
  modelMessage,
  ToolValidationError,
  type ChatMessage,
} from "../_shared/aiContracts.ts";
import { getAssistantDashboard } from "../_shared/aiDashboard.ts";
import { getAssistantMessageHistory } from "../_shared/aiMessageHistory.ts";
import { getAIProvider } from "../_shared/aiProvider.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffRole } from "../_shared/auth.ts";
import {
  getSupabasePublishableKey,
  getSupabaseSecretKey,
} from "../_shared/supabaseEnv.ts";
import {
  createEvaluationWithMessages,
  completeEvaluation,
  noShowEvaluation,
  checkScheduleConflicts,
} from "../_shared/evaluations.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const aiProvider = getAIProvider("google/gemini-3-flash-preview");

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
      description:
        "Estatísticas gerais: total de alunos, mensagens enviadas hoje, agendadas pendentes, aniversariantes, alunos sem avaliação.",
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
          status: {
            type: "string",
            enum: ["pending", "sent", "failed", "all"],
          },
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
      description:
        "Lista compromissos de avaliação física (evaluations) com nome do aluno. Use para responder 'quais avaliações tenho amanhã/hoje/semana'.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["scheduled", "completed", "no_show", "cancelled", "all"],
          },
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
      description:
        "Agenda uma avaliação física real (cria compromisso na tabela evaluations e as 3 mensagens automáticas). Verifica travas de duplicidade e conflito antes de criar. SEMPRE requer confirmação do usuário.",
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
      description:
        "Fecha uma avaliação como realizada ou faltou. Atualiza had_evaluation/last_evaluation_date, deleta mensagens pendentes vinculadas e agenda follow-up (7d) ou remarcação (amanhã). SEMPRE requer confirmação.",
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
      description:
        "Agenda mensagem(ns) na fila do processador (com delay anti-ban). Aceita 1 ou vários alunos. Se o usuário disser 'envia agora', use scheduled_for = agora+2min. Se student_ids tiver mais de 20 alunos, as mensagens são espalhadas automaticamente ao longo de 1 hora. SEMPRE requer confirmação.",
      parameters: {
        type: "object",
        properties: {
          student_ids: { type: "array", items: { type: "string" } },
          content: { type: "string" },
          scheduled_for: {
            type: "string",
            description: "ISO datetime. Opcional — padrão agora+2min.",
          },
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
      description:
        "Cria template de mensagem pré-definida. SEMPRE requer confirmação.",
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
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function studentName(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("students")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("studentName error:", error);
  return data?.name ?? "aluno";
}

// Descrição legível pro card de confirmação
async function describeWriteAction(
  name: string,
  rawArgs: unknown,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const { tool, args } = parseToolAction(name, rawArgs);
  switch (tool) {
    case "schedule_evaluation": {
      const n = await studentName(supabase, args.student_id);
      return `Agendar avaliação de ${n} para ${fmtBR(args.scheduled_at)} (com 3 mensagens automáticas: confirmação, véspera 18h e 3h antes).`;
    }
    case "complete_evaluation": {
      const { data } = await supabase
        .from("evaluations")
        .select("scheduled_at, students(name)")
        .eq("id", args.evaluation_id)
        .maybeSingle();
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
      const when = args.scheduled_for
        ? fmtBR(args.scheduled_for)
        : "próximos 2 minutos";
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

async function executeTool(
  name: string,
  rawArgs: unknown,
  supabase: SupabaseClient<Database>,
): Promise<Json> {
  const { tool, args } = parseToolAction(name, rawArgs);
  console.log(`[tool] ${tool}`);
  switch (tool) {
    // READ
    case "list_students": {
      let q = supabase
        .from("students")
        .select(
          "id, name, phone, birth_date, had_evaluation, last_evaluation_date, created_at",
        )
        .order("name");
      if (args.search) q = q.ilike("name", `%${args.search}%`);
      q = q.limit(args.limit || 50);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length || 0, students: data };
    }
    case "get_dashboard_stats": {
      return await getAssistantDashboard(() => supabase.rpc("get_workout_dashboard"));
    }

    case "list_scheduled_messages": {
      let q = supabase
        .from("scheduled_messages")
        .select(
          "id, content, scheduled_for, status, message_type, students(name, phone)",
        )
        .order("scheduled_for", { ascending: true });
      if (args.status && args.status !== "all") q = q.eq("status", args.status);
      if (args.from) q = q.gte("scheduled_for", args.from);
      if (args.to) q = q.lte("scheduled_for", args.to);
      q = q.limit(args.limit || 30);
      const { data, error } = await q;
      if (error) throw error;
      return { count: data?.length || 0, messages: data };
    }
    case "list_sent_messages": {
      return await getAssistantMessageHistory(supabase, args);
    }
    case "list_predefined_messages": {
      const { data, error } = await supabase
        .from("predefined_messages")
        .select("id, title, content")
        .order("title");
      if (error) throw error;
      return { count: data?.length || 0, messages: data };
    }
    case "get_whatsapp_status": {
      const { data, error } =
        await supabase.functions.invoke("whatsapp-status");
      if (error) return { connected: false, error: error.message };
      return data;
    }
    case "list_evaluations": {
      let q = supabase
        .from("evaluations")
        .select(
          "id, scheduled_at, status, notes, completed_at, students(name, phone)",
        )
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
        return {
          success: false,
          error: "scheduled_at deve ser uma data futura válida (ISO).",
        };
      }
      const check = await checkScheduleConflicts(
        supabase,
        args.student_id,
        when,
      );
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
      const res = await createEvaluationWithMessages(
        supabase,
        args.student_id,
        when,
        args.notes ?? null,
      );
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
      const { data, error } = await supabase
        .from("students")
        .insert({
          name: args.name,
          phone: args.phone,
          birth_date: args.birth_date || null,
          had_evaluation: args.had_evaluation || false,
        })
        .select()
        .single();
      if (error) throw error;
      return { success: true, student: data };
    }
    case "schedule_message": {
      const ids: string[] = args.student_ids || [];
      if (!ids.length) return { success: false, error: "student_ids vazio" };
      const base = args.scheduled_for
        ? new Date(args.scheduled_for)
        : new Date(Date.now() + 2 * 60 * 1000);
      if (isNaN(base.getTime()) || base.getTime() <= Date.now())
        return { success: false, error: "scheduled_for deve ser futuro" };
      const spread = ids.length > 20;
      const spanMs = spread ? 60 * 60 * 1000 : 0;

      // Buscar nomes para substituir {nome} — mesmo comportamento de replaceNameVar
      // em src/pages/EnviarMensagem.tsx
      const { data: studentsForNames, error: studentsError } = await supabase
        .from("students")
        .select("id, name")
        .in("id", ids);
      if (studentsError) throw studentsError;
      if (studentsForNames?.length !== ids.length)
        throw new ToolValidationError(
          "Um ou mais alunos não foram encontrados.",
        );
      const nameById = new Map<string, string>(
        (studentsForNames || []).map((s) => [s.id, s.name || "aluno"]),
      );

      const rawContent: string = args.content || "";
      const rows = ids.map((sid, i) => {
        const offset = spread
          ? Math.floor((spanMs / (ids.length - 1)) * i) +
            Math.floor(Math.random() * 30000)
          : ids.length > 1
            ? Math.floor(Math.random() * (i + 1) * 60 * 1000)
            : 0;
        const nome = nameById.get(sid) || "aluno";
        const content = rawContent.replace(/\{nome\}/gi, nome);
        return {
          student_id: sid,
          content,
          scheduled_for: new Date(base.getTime() + offset).toISOString(),
          message_type: args.message_type || "manual",
          status: "pending",
        };
      });
      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) throw error;
      return {
        success: true,
        enqueued: rows.length,
        spread_over_minutes: spread ? 60 : 0,
      };
    }

    case "delete_scheduled_message": {
      const { data, error } = await supabase.rpc(
        "cancel_scheduled_messages_tx",
        { _ids: [args.id] },
      );
      if (error) throw error;
      const cancelled = record(data).cancelled,
        inFlight = record(data).in_flight;
      if (typeof cancelled !== "number" || typeof inFlight !== "number")
        throw new Error("Resposta de cancelamento inválida");
      return { success: cancelled > 0, cancelled, in_flight: inFlight };
    }
    case "create_predefined_message": {
      const { data, error } = await supabase
        .from("predefined_messages")
        .insert({ title: args.title, content: args.content })
        .select()
        .single();
      if (error) throw error;
      return { success: true, predefined: data };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

const SYSTEM_PROMPT = `Você é o assistente do "Academia Workout" — SaaS de gestão que envia mensagens automáticas por WhatsApp.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const authFail = await requireStaffRole(req, ["admin", "recepcao"]);
  if (authFail) return authFail;

  try {
    const rawBody: unknown = await req.json().catch(() => {
      throw new ToolValidationError("JSON da requisição inválido.");
    });
    if (!isRecord(rawBody))
      throw new ToolValidationError("Corpo da requisição inválido.");
    const body = rawBody;
    let clientMessages = clientHistory(body.messages ?? []);
    const confirmedAction =
      body.confirmedAction === undefined
        ? undefined
        : record(body.confirmedAction);
    const rejectedAction =
      body.rejectedAction === undefined
        ? undefined
        : record(body.rejectedAction);
    if (confirmedAction && rejectedAction)
      throw new ToolValidationError("Escolha uma ação por vez.");
    const hasContext =
      body.conversationId !== undefined || body.responseMessageId !== undefined;
    if (
      hasContext &&
      (!chatUuid(body.conversationId) ||
        !chatUuid(body.responseMessageId) ||
        !chatUuid(body.requestMessageId))
    )
      throw new ToolValidationError("Contexto da conversa inválido.");
    const conversationId = hasContext ? (body.conversationId as string) : null;
    const responseMessageId = hasContext
      ? (body.responseMessageId as string)
      : null;
    const requestMessageId = hasContext
      ? (body.requestMessageId as string)
      : null;

    const supabase = createClient<Database>(
      SUPABASE_URL,
      getSupabasePublishableKey(),
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );
    const identity = await supabase.auth.getUser(
      req.headers.get("Authorization")!.replace(/^Bearer /, ""),
    );
    if (identity.error || !identity.data.user)
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    const ownerId = identity.data.user.id;
    // Administrative access is restricted to the server-owned confirmation store.
    // The action itself still uses the caller's client and its RLS.
    const confirmations = createClient<Database>(
      SUPABASE_URL,
      getSupabaseSecretKey(),
    );
    if (conversationId) {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error || !data)
        return new Response(
          JSON.stringify({ error: "Conversa indisponível." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
    }
    const reply = async (
      payload: {
        message: string;
        pendingAction?: {
          id: string;
          tool: string;
          args: Json;
          description: string;
        };
        actionState?: ActionState;
        result?: Json;
        alreadyProcessed?: boolean;
      },
      status = 200,
    ) => {
      let historySaved: boolean | undefined;
      if (conversationId && responseMessageId && status === 200) {
        const saved = await supabase.rpc("append_ai_message_tx", {
          _id: responseMessageId,
          _conversation_id: conversationId,
          _role: "assistant",
          _content: payload.message,
          _action_id: payload.pendingAction?.id ?? null,
          _reply_to: requestMessageId,
        });
        historySaved = !saved.error && saved.data === responseMessageId;
      }
      return new Response(JSON.stringify({ ...payload, historySaved }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };
    // The saved request is authoritative; recovery cannot reuse another response's ID.
    if (conversationId && responseMessageId && requestMessageId) {
      const historyResult = await supabase.rpc("get_ai_conversation_history", {
        _conversation_id: conversationId,
      });
      if (historyResult.error) throw historyResult.error;
      const history = chatHistory(historyResult.data);
      const requestIndex = history.findIndex((m) => m.id === requestMessageId);
      const requested = history[requestIndex];
      const decision = confirmedAction ?? rejectedAction;
      if (
        !requested ||
        (decision
          ? requested.role !== "assistant" ||
            requested.pendingAction?.id !== decision.id
          : requested.role !== "user")
      )
        throw new ToolValidationError(
          "Pergunta ou proposta não pertence a esta conversa.",
        );
      clientMessages = clientHistory(
        recentChatContext(history.slice(0, requestIndex + 1)),
      );
      const existing = history.find((m) => m.id === responseMessageId);
      if (existing) {
        if (
          existing.role !== "assistant" ||
          existing.replyTo !== requestMessageId
        )
          throw new ToolValidationError(
            "O identificador de resposta já foi usado por outra pergunta.",
          );
        return new Response(
          JSON.stringify({
            message: existing.content,
            pendingAction: existing.pendingAction,
            actionState: existing.actionState,
            historySaved: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const selectedAction = confirmedAction ?? rejectedAction;
    if (selectedAction) {
      if (!chatUuid(selectedAction.id))
        throw new ToolValidationError(
          "Solicite uma proposta válida antes de confirmar ou cancelar.",
        );
      if (conversationId) {
        const found = await confirmations
          .from("ai_pending_actions")
          .select("conversation_id")
          .eq("id", selectedAction.id)
          .eq("owner_id", ownerId)
          .maybeSingle();
        if (found.error || found.data?.conversation_id !== conversationId)
          return new Response(
            JSON.stringify({ error: "Esta proposta não pertence à conversa." }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
      }
    }
    if (rejectedAction) {
      const rejected = await confirmations.rpc("reject_ai_action_tx", {
        _id: rejectedAction.id as string,
        _owner_id: ownerId,
      });
      if (rejected.error)
        return new Response(
          JSON.stringify({ error: "Não foi possível cancelar a proposta." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      if (record(rejected.data).state !== "rejected")
        return reply(
          {
            message:
              "A ação já foi iniciada. Confira o histórico antes de tentar outra operação.",
          },
          409,
        );
      return reply({
        message: "Proposta cancelada. Se quiser, podemos preparar outra.",
        actionState: "rejected",
      });
    }

    // Contexto temporal atual (timezone de Brasília) — injetado a cada request
    const tz = "America/Sao_Paulo";
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateContext = `DATA/HORA ATUAL: ${fmt.format(now)} (${tz}). ISO: ${now.toISOString()}. Use SEMPRE esta referência para interpretar "hoje", "amanhã", "esta semana", etc.`;

    // Se veio uma ação já confirmada, executa direto e retorna mensagem sintetizada.
    if (confirmedAction) {
      if (
        typeof confirmedAction.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          confirmedAction.id,
        )
      ) {
        return new Response(
          JSON.stringify({
            error: "Solicite uma nova proposta antes de confirmar.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const claim = await confirmations.rpc("claim_ai_action_tx", {
        _id: confirmedAction.id,
        _owner_id: ownerId,
      });
      if (claim.error)
        return new Response(
          JSON.stringify({
            error: "Confirmação indisponível, expirada ou sem permissão.",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      const action = record(claim.data);
      if (action.state !== "claimed") {
        const complete = action.state === "completed";
        return reply(
          {
            message: complete
              ? "Esta ação já foi processada."
              : "Esta ação está indisponível ou já foi iniciada. Confira o histórico.",
            result: action.result as Json,
            alreadyProcessed: true,
            actionState: complete
              ? record(action.result).success === false
                ? "blocked"
                : "completed"
              : undefined,
          },
          complete ? 200 : 409,
        );
      }
      let result: Json;
      try {
        if (typeof action.tool !== "string" || !WRITE_TOOLS.has(action.tool))
          throw new Error("Ação inválida");
        result = await executeTool(action.tool, action.args, supabase);
      } catch (e: unknown) {
        await confirmations.rpc("finish_ai_action_tx", {
          _id: confirmedAction.id,
          _owner_id: ownerId,
          _result: {
            error:
              "Execução falhou; confira os registros antes de criar outra proposta.",
          },
          _failed: true,
        });
        return reply({
          message: `❌ Não consegui executar: ${errorMessage(e, "erro")}.`,
          actionState: "failed",
        });
      }
      const finished = await confirmations.rpc("finish_ai_action_tx", {
        _id: confirmedAction.id,
        _owner_id: ownerId,
        _result: result,
        _failed: false,
      });
      if (finished.error)
        return new Response(
          JSON.stringify({
            message:
              "A execução foi iniciada, mas não consegui registrar o resultado. Confira os dados antes de criar outra proposta.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      let finalMsg =
        record(result).success === false
          ? "A operação foi bloqueada. Confira o resultado."
          : "Operação executada.";
      // Failure of the optional summary must never turn a completed write into a retry.
      try {
        if (aiProvider.apiKey) {
          const summarizeResp = await fetch(aiProvider.url, {
            signal: AbortSignal.timeout(15000),
            method: "POST",
            headers: {
              Authorization: `Bearer ${aiProvider.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: aiProvider.model,
              messages: [
                {
                  role: "system",
                  content: SYSTEM_PROMPT + "\n\n" + dateContext,
                },
                ...clientMessages,
                {
                  role: "assistant",
                  content: `Ação "${action.tool}" executada com resultado: ${JSON.stringify(result).slice(0, 800)}`,
                },
                {
                  role: "user",
                  content:
                    "Escreva UMA resposta curta em português confirmando ao usuário o que foi feito (ou o erro/bloqueio, se houver). Não chame ferramentas.",
                },
              ],
            }),
          });
          if (summarizeResp.ok) {
            const d = modelMessage(await summarizeResp.json());
            finalMsg = d?.content || finalMsg;
          }
        }
      } catch {
        /* The structured, committed result remains available. */
      }
      return reply({
        message: finalMsg,
        result,
        actionState: record(result).success === false ? "blocked" : "completed",
      });
    }

    if (!aiProvider.apiKey)
      return new Response(
        JSON.stringify({ error: "Provedor de IA não configurado" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n" + dateContext },
      ...clientMessages,
    ];

    for (let i = 0; i < 6; i++) {
      const resp = await fetch(aiProvider.url, {
        signal: AbortSignal.timeout(45000),
        method: "POST",
        headers: {
          Authorization: `Bearer ${aiProvider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiProvider.model,
          messages,
          tools,
        }),
      });

      if (resp.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Limite de requisições atingido. Tente de novo em alguns instantes.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Créditos esgotados. Adicione créditos em Settings > Workspace > Usage.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (!resp.ok) {
        await resp.body?.cancel();
        console.error("AI gateway status:", resp.status);
        return new Response(
          JSON.stringify({
            error: "Falha no provedor de IA. Tente novamente.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const msg = modelMessage(await resp.json());
      if (!msg) {
        return reply({
          message: "Não recebi resposta do modelo. Reformule a pergunta.",
        });
      }

      messages.push(msg);
      const toolCalls = msg.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return reply({ message: msg.content || "Não recebi texto do modelo." });
      }

      // Se alguma tool_call for de escrita, INTERROMPE aqui e devolve pendingAction ao front.
      const writeCall = toolCalls.find((tc) =>
        WRITE_TOOLS.has(tc.function?.name),
      );
      if (writeCall) {
        let rawArgs: unknown;
        try {
          rawArgs = JSON.parse(writeCall.function.arguments || "{}");
        } catch {
          throw new ToolValidationError(
            "A IA propôs argumentos inválidos. Solicite uma nova proposta.",
          );
        }
        const { args } = parseToolAction(writeCall.function.name, rawArgs);
        const description = await describeWriteAction(
          writeCall.function.name,
          args,
          supabase,
        );
        const stored = await confirmations
          .from("ai_pending_actions")
          .insert({
            owner_id: ownerId,
            conversation_id: conversationId,
            description,
            tool: writeCall.function.name,
            args,
          })
          .select("id")
          .single();
        if (stored.error)
          throw new Error("Não foi possível registrar a proposta de ação");
        const preface =
          msg.content && typeof msg.content === "string" && msg.content.trim()
            ? msg.content
            : "Antes de executar, preciso da sua confirmação:";
        return reply({
          message: preface,
          actionState: "pending",
          pendingAction: {
            id: stored.data.id,
            tool: writeCall.function.name,
            args,
            description,
          },
        });
      }

      // Só tools de leitura — executa e continua o loop
      for (const tc of toolCalls) {
        let result: Json;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          result = await executeTool(tc.function.name, args, supabase);
        } catch (e: unknown) {
          console.error(`Tool ${tc.function.name} error:`, e);
          result = { error: errorMessage(e, "tool error") };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return reply({ message: "Não consegui concluir a tarefa. Reformule?" });
  } catch (e: unknown) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({
        error:
          e instanceof ToolValidationError
            ? e.message
            : "Erro interno. Confira os logs do servidor.",
      }),
      {
        status: e instanceof ToolValidationError ? 400 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
