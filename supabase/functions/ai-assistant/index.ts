import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const tools = [
  {
    type: "function",
    function: {
      name: "list_students",
      description: "Lista alunos cadastrados. Use para responder perguntas sobre alunos, buscar por nome, ver datas de avaliação, aniversários etc.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Filtra por nome (case-insensitive). Opcional." },
          limit: { type: "number", description: "Máximo de resultados (padrão 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Retorna estatísticas gerais: total de alunos, mensagens enviadas hoje, mensagens agendadas pendentes, aniversariantes do dia, alunos sem avaliação.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scheduled_messages",
      description: "Lista mensagens agendadas. Filtra por status (pending, sent, failed) e por intervalo de datas.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "sent", "failed", "all"] },
          from: { type: "string", description: "ISO date inicial. Opcional." },
          to: { type: "string", description: "ISO date final. Opcional." },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sent_messages",
      description: "Lista mensagens já enviadas (histórico).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
          student_name: { type: "string", description: "Filtra por nome do aluno. Opcional." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_predefined_messages",
      description: "Lista mensagens pré-definidas (templates) cadastradas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_whatsapp_status",
      description: "Verifica se o WhatsApp da academia está conectado via Evolution API.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_student",
      description: "Cadastra um novo aluno no sistema.",
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
      description: "Agenda uma mensagem para um aluno específico.",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string", description: "UUID do aluno." },
          content: { type: "string" },
          scheduled_for: { type: "string", description: "ISO datetime futuro." },
          message_type: { type: "string" },
        },
        required: ["student_id", "content", "scheduled_for"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_predefined_message",
      description: "Cria uma nova mensagem pré-definida (template).",
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
  {
    type: "function",
    function: {
      name: "send_whatsapp_now",
      description: "Envia uma mensagem WhatsApp imediatamente para um ou mais alunos via Evolution API. Use student_ids OU phones.",
      parameters: {
        type: "object",
        properties: {
          student_ids: { type: "array", items: { type: "string" } },
          phones: { type: "array", items: { type: "string" } },
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_scheduled_message",
      description: "Cancela/exclui uma mensagem agendada pelo seu id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];

async function executeTool(name: string, args: any, supabase: any): Promise<any> {
  console.log(`[tool] ${name}`, JSON.stringify(args).slice(0, 300));
  switch (name) {
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
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);
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
    case "create_student": {
      const { data, error } = await supabase.from("students").insert({
        name: args.name, phone: args.phone, birth_date: args.birth_date || null, had_evaluation: args.had_evaluation || false,
      }).select().single();
      if (error) throw error;
      return { success: true, student: data };
    }
    case "schedule_message": {
      const { data, error } = await supabase.from("scheduled_messages").insert({
        student_id: args.student_id, content: args.content, scheduled_for: args.scheduled_for, message_type: args.message_type || "manual", status: "pending",
      }).select().single();
      if (error) throw error;
      return { success: true, message: data };
    }
    case "create_predefined_message": {
      const { data, error } = await supabase.from("predefined_messages").insert({ title: args.title, content: args.content }).select().single();
      if (error) throw error;
      return { success: true, predefined: data };
    }
    case "send_whatsapp_now": {
      let students: any[] = [];
      if (args.student_ids?.length) {
        const { data } = await supabase.from("students").select("id, name, phone").in("id", args.student_ids);
        students = data || [];
      } else if (args.phones?.length) {
        students = args.phones.map((p: string, i: number) => ({ id: `tmp-${i}`, name: p, phone: p }));
      }
      if (!students.length) return { success: false, error: "Nenhum destinatário fornecido." };
      const { data, error } = await supabase.functions.invoke("send-whatsapp", { body: { students, message: args.message } });
      if (error) throw error;
      return { success: true, result: data };
    }
    case "delete_scheduled_message": {
      const { error } = await supabase.from("scheduled_messages").delete().eq("id", args.id);
      if (error) throw error;
      return { success: true };
    }
    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

const SYSTEM_PROMPT = `Você é o assistente inteligente do sistema "Academia Workout", um SaaS de gestão de academia que automatiza envios de mensagens via WhatsApp (Evolution API).

ESTRUTURA DO SITE (ajude o usuário a navegar quando perguntado):
- Dashboard (/) — estatísticas gerais, status do WhatsApp e atalhos rápidos.
- Alunos (/alunos) — Cadastrar Aluno e Lista de Alunos. Pode importar contatos do WhatsApp.
- Agendar Mensagem (/agendar-mensagem) — agenda mensagens (modo Rápido com presets 7/21/45 dias, ou Personalizado com data + recorrência opcional).
- Mensagens Agendadas (/mensagens-agendadas) — gerencia as pendentes/falhas.
- Enviar Mensagem (/enviar-mensagem) — envio em massa imediato.
- Mensagens Enviadas (/mensagens-enviadas) — histórico.
- Mensagens Pré-definidas (/mensagens-predefinidas) — templates reutilizáveis.
- Assistente IA (/assistente-ia) — você está aqui.

AUTOMAÇÃO: Mensagens agendadas são enviadas automaticamente via cron (a cada minuto) chamando a Evolution API. O WhatsApp da academia precisa estar conectado.

COMO AGIR:
- Você TEM ferramentas reais. Use-as para responder perguntas com dados verdadeiros (nunca invente números, nomes ou status).
- Para qualquer pergunta sobre alunos, mensagens, status ou estatísticas, CHAME a tool apropriada antes de responder.
- Para ações destrutivas/importantes (criar aluno, enviar WhatsApp agora, agendar, excluir), explique o que fará e execute a tool — o sistema já roda com permissão.
- Responda em português, de forma clara, prática e amigável. Use markdown e emojis com moderação.
- Quando listar dados, mostre os mais relevantes (não despeje JSON cru).`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { messages: clientMessages } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(clientMessages || []),
    ];

    // Agentic loop: até 6 iterações
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
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const finishReason = choice?.finish_reason;

      if (!msg) {
        console.error("Resposta sem message. finish_reason:", finishReason, "raw:", JSON.stringify(data).slice(0, 800));
        return new Response(JSON.stringify({
          message: "Recebi sua solicitação, mas o modelo não retornou uma resposta. Tente reformular a pergunta de forma mais específica.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      messages.push(msg);

      const toolCalls = msg.tool_calls;
      const hasContent = typeof msg.content === "string" && msg.content.trim().length > 0;

      // Se não há tool_calls e nem conteúdo, modelo "travou" — pedimos síntese final sem tools
      if ((!toolCalls || toolCalls.length === 0) && !hasContent) {
        console.warn("Modelo retornou message vazio. finish_reason:", finishReason, "— tentando síntese final sem tools.");
        const finalResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              ...messages,
              { role: "user", content: "Com base nas informações que você já obteve das ferramentas acima, escreva uma resposta clara e completa em português para o usuário. Não chame mais ferramentas." },
            ],
          }),
        });
        if (finalResp.ok) {
          const finalData = await finalResp.json();
          const finalMsg = finalData.choices?.[0]?.message?.content;
          if (finalMsg) {
            return new Response(JSON.stringify({ message: finalMsg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
        return new Response(JSON.stringify({
          message: "Consultei os dados, mas não consegui gerar uma resposta final. Pode reformular a pergunta?",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!toolCalls || toolCalls.length === 0) {
        return new Response(JSON.stringify({ message: msg.content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Executa todas as tools chamadas e adiciona resultados
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

    return new Response(JSON.stringify({ message: "Não consegui concluir a tarefa em tempo hábil. Pode reformular?" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: "Erro interno", details: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
