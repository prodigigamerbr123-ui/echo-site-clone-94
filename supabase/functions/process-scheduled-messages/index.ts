import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatPhone } from "../_shared/phone.ts";
import { sendEvolutionText } from "../_shared/evolution.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_RUN = 12;
const MAX_RETRIES = 3;
const RETRY_DELAY_MINUTES = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function randomDelayMs() {
  // 5s..15s
  return 5000 + Math.floor(Math.random() * 10001);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_INSTANCE_TOKEN = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");

    if (!EVOLUTION_API_URL || !EVOLUTION_INSTANCE_TOKEN) {
      return new Response(JSON.stringify({ error: "Evolution API não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Recuperar mensagens presas em "processing" por >10min
    const { data: resetCount } = await supabase.rpc("reset_stuck_scheduled_messages");
    if (resetCount && Number(resetCount) > 0) {
      console.log(`Reset ${resetCount} stuck 'processing' messages`);
    }

    // 2) Claim atômico das mensagens vencidas
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_due_scheduled_messages",
      { _limit: MAX_PER_RUN },
    );
    if (claimError) throw claimError;

    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    let sent = 0;
    let failed = 0;
    let retried = 0;
    let recurrenceEnqueued = 0;

    // Precisamos dos dados do aluno + status, então buscamos em lote
    const studentIds = Array.from(new Set(claimed.map((m: any) => m.student_id)));
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, name, phone, status")
      .in("id", studentIds);
    const studentsById = new Map<string, any>((studentsData || []).map((s: any) => [s.id, s]));

    for (let i = 0; i < claimed.length; i++) {
      const msg = claimed[i] as any;
      const student = studentsById.get(msg.student_id);

      // Só falha se o aluno não existe mais no sistema
      if (!student) {
        await supabase
          .from("scheduled_messages")
          .update({ status: "failed", failure_reason: "Aluno não encontrado" })
          .eq("id", msg.id);
        failed++;
        continue;
      }

      // Bloqueia mensagens AUTOMÁTICAS para alunos inativos.
      // Exceções: 'manual' (dono decide) e 'reengagement' (alvo é justamente o inativo).
      if (
        student.status !== "active" &&
        msg.message_type !== "manual" &&
        msg.message_type !== "reengagement"
      ) {
        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            failure_reason: "Aluno inativo — mensagem automática bloqueada",
          })
          .eq("id", msg.id);
        failed++;
        continue;
      }



      const phoneCheck = formatPhone(student.phone);
      if (!phoneCheck.ok) {
        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            failure_reason: `Telefone inválido: ${phoneCheck.reason}`,
          })
          .eq("id", msg.id);
        failed++;
        continue;
      }

      // Delay anti-ban antes de cada envio (exceto o primeiro)
      if (i > 0) await sleep(randomDelayMs());

      try {
        const sendResult = await sendEvolutionText({
          baseUrl,
          instanceToken: EVOLUTION_INSTANCE_TOKEN,
          number: phoneCheck.number,
          text: msg.content,
        });

        if (sendResult.ok) {
          await supabase
            .from("scheduled_messages")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              failure_reason: null,
            })
            .eq("id", msg.id);
          await supabase.from("messages").insert({
            student_id: msg.student_id,
            content: msg.content,
            status: "sent",
          });
          sent++;

          // Recorrência: enfileira próxima ocorrência se ainda restam
          if (
            msg.recurrence_interval_days &&
            msg.recurrence_count &&
            Number(msg.recurrence_count) > 1
          ) {
            const nextDate = new Date(
              new Date(msg.scheduled_for).getTime() +
                Number(msg.recurrence_interval_days) * 86400000,
            );
            const { error: recError } = await supabase.from("scheduled_messages").insert({
              student_id: msg.student_id,
              content: msg.content,
              scheduled_for: nextDate.toISOString(),
              message_type: msg.message_type,
              status: "pending",
              recurrence_interval_days: msg.recurrence_interval_days,
              recurrence_count: Number(msg.recurrence_count) - 1,
              recurrence_parent_id: msg.recurrence_parent_id || msg.id,
            });
            if (!recError) recurrenceEnqueued++;
            else console.error("Erro criando recorrência:", recError);
          }
        } else {
          const reason = sendResult.reason || `HTTP ${sendResult.httpStatus || "desconhecido"}`;
          console.error(`Falha ao enviar ${msg.id}:`, reason, sendResult.bodyText?.slice(0, 300));
          await handleFailure(supabase, msg, reason.slice(0, 250));
          if (Number(msg.retry_count || 0) < MAX_RETRIES) retried++;
          else failed++;
        }
      } catch (err: any) {
        console.error(`Erro enviando ${msg.id}:`, err);
        await handleFailure(supabase, msg, err?.message || "Erro de rede");
        if (Number(msg.retry_count || 0) < MAX_RETRIES) retried++;
        else failed++;
      }
    }

    return new Response(
      JSON.stringify({
        processed: claimed.length,
        sent,
        failed,
        retried,
        recurrenceEnqueued,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("process-scheduled-messages error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleFailure(supabase: any, msg: any, reason: string) {
  const currentRetries = Number(msg.retry_count || 0);
  if (currentRetries < MAX_RETRIES) {
    const nextTry = new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000).toISOString();
    await supabase
      .from("scheduled_messages")
      .update({
        status: "pending",
        retry_count: currentRetries + 1,
        scheduled_for: nextTry,
        failure_reason: reason,
      })
      .eq("id", msg.id);
  } else {
    await supabase
      .from("scheduled_messages")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", msg.id);
  }
}
