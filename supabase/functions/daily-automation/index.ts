// Motor de regras que roda 1x/dia (via pg_cron) e agenda mensagens automáticas.
// - Lembretes de avaliação vencida (>90 dias) ou pendente (>14 dias após cadastro)
// - Aniversários
// - Lembretes de vencimento da mensalidade (antes e no dia)
// - Distribui horários entre 09:00 e 12:00 para não disparar em massa
// - Sorteia entre variações de texto por tipo
// - Limita a 60 novos agendamentos por execução (avaliação); pagamento tem cap próprio
// - Só considera alunos com status 'active'

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/auth.ts";
import { resolveAutomationMessage } from "../_shared/messageTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const DEFAULT_DAILY_LIMIT = 60;
const DEFAULT_DAYS_OVERDUE = 90;
const DEFAULT_PAYMENT_DAYS_BEFORE = 3;
const DEFAULT_PAYMENT_CAP = 200;

type SettingsMap = Record<string, { enabled: boolean; params: Record<string, any> }>;

async function loadSettings(supabase: any): Promise<SettingsMap> {
  const { data } = await supabase
    .from("automation_settings")
    .select("key, enabled, params");
  const map: SettingsMap = {};
  for (const r of data ?? []) {
    map[r.key] = { enabled: !!r.enabled, params: (r.params as any) ?? {} };
  }
  return map;
}
function isEnabled(map: SettingsMap, key: string): boolean {
  // Alinhado com o frontend: sem linha em automation_settings == desligado.
  const s = map[key];
  return s ? s.enabled : false;
}
function getParam<T>(map: SettingsMap, key: string, name: string, fallback: T): T {
  const v = map[key]?.params?.[name];
  return (v === undefined || v === null ? fallback : v) as T;
}

const REMINDER_TEMPLATES = [
  (name: string) =>
    `Oi ${name}! 💪 Faz um tempinho que a gente não faz sua avaliação física. Bora marcar pra acompanhar sua evolução?`,
  (name: string) =>
    `Olá ${name}! 📋 Está na hora da sua avaliação física. Me avisa qual o melhor dia pra você que já reservo o horário!`,
  (name: string) =>
    `E aí ${name}! 🏋️ Que tal vermos juntos como está sua evolução? Já podemos agendar sua nova avaliação física.`,
];

const BIRTHDAY_TEMPLATES = [
  (name: string) => `🎉 Feliz aniversário, ${name}! Que este novo ciclo venha cheio de treinos, saúde e conquistas! 🎂`,
  (name: string) => `Parabéns, ${name}! 🥳 Toda a equipe deseja um dia incrível e um ano de muita saúde e disposição! 💪`,
  (name: string) => `${name}, hoje é seu dia! 🎂 Que ele seja tão especial quanto sua dedicação. Feliz aniversário! ❤️`,
];

const PAYMENT_BEFORE_TEMPLATE = (name: string, days: number) =>
  `Oi ${name}! 💪 Passando pra lembrar que sua mensalidade vence em ${days} dias. Qualquer dúvida é só chamar!`;

const PAYMENT_DUE_TEMPLATE = (name: string) =>
  `Oi ${name}! Sua mensalidade vence hoje. Bora manter o treino em dia? 🏋️ Qualquer coisa estou à disposição!`;

const PAYMENT_OVERDUE_TEMPLATE = (name: string, days: number) =>
  `Oi ${name}! Sua mensalidade está ${days} ${days === 1 ? "dia" : "dias"} em atraso. Consegue regularizar hoje? Qualquer coisa é só me chamar!`;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- Fuso SP (UTC-3, sem DST) ----
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
function spDateStrToday(): string {
  const s = new Date(Date.now() + SP_OFFSET_MS);
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, "0");
  const d = String(s.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Retorna uma data hoje entre 12:00 e 15:00 (horário de Brasília, UTC-3 sem DST)
function scatterTimeToday(): Date {
  const nowSp = new Date(Date.now() + SP_OFFSET_MS);
  const y = nowSp.getUTCFullYear();
  const mo = nowSp.getUTCMonth();
  const d = nowSp.getUTCDate();
  const hSp = 12 + Math.floor(Math.random() * 3);
  const mi = Math.floor(Math.random() * 60);
  // Constrói UTC que representa hSp:mi em SP
  return new Date(Date.UTC(y, mo, d, hSp, mi) - SP_OFFSET_MS);
}

function isBirthdayToday(birth: string | null): boolean {
  if (!birth) return false;
  // birth vem como "YYYY-MM-DD" (date puro), compara direto por string
  const [, bm, bd] = birth.split("-");
  const nowSp = new Date(Date.now() + SP_OFFSET_MS);
  const mm = String(nowSp.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowSp.getUTCDate()).padStart(2, "0");
  return bm === mm && bd === dd;
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronFail = requireCronSecret(req);
  if (cronFail) return cronFail;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const settings = await loadSettings(supabase);
    const birthdayOn = isEnabled(settings, "birthday");
    const inviteOn = isEnabled(settings, "evaluation_invite");
    const paymentOn = isEnabled(settings, "payment_reminder");
    const overdueOn = isEnabled(settings, "payment_overdue");
    const daysOverdue = Number(
      getParam(settings, "evaluation_invite", "days_overdue", DEFAULT_DAYS_OVERDUE),
    );
    const dailyLimit = Number(
      getParam(settings, "evaluation_invite", "daily_limit", DEFAULT_DAILY_LIMIT),
    );
    const paymentDaysBefore = Number(
      getParam(settings, "payment_reminder", "days_before", DEFAULT_PAYMENT_DAYS_BEFORE),
    );
    const paymentCap = Number(
      getParam(settings, "payment_reminder", "daily_limit", DEFAULT_PAYMENT_CAP),
    );

    // Carrega todos os alunos ativos (pagina para passar do limite 1000)
    const activeStudents: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, birth_date, last_evaluation_date, had_evaluation, created_at, status, payment_due_date")
        .eq("status", "active")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      activeStudents.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Já existe algo pendente para (aluno, tipo)?
    const { data: pendings } = await supabase
      .from("scheduled_messages")
      .select("student_id, message_type")
      .eq("status", "pending")
      .in("message_type", [
        "evaluation_reminder",
        "birthday",
        "payment_reminder_before",
        "payment_reminder_due",
        "payment_overdue",
      ]);
    const hasPending = new Set(
      (pendings || []).map((p: any) => `${p.student_id}:${p.message_type}`),
    );

    // ---- 1) Aniversariantes de hoje ----
    const birthdayInserts: any[] = [];
    if (birthdayOn) {
      for (const s of activeStudents) {
        if (!isBirthdayToday(s.birth_date)) continue;
        if (hasPending.has(`${s.id}:birthday`)) continue;
        const content = await resolveAutomationMessage(
          supabase, settings, "birthday", "birthday",
          pick(BIRTHDAY_TEMPLATES)(s.name), { nome: s.name },
        );
        birthdayInserts.push({
          student_id: s.id,
          content,
          scheduled_for: scatterTimeToday().toISOString(),
          message_type: "birthday",
          status: "pending",
        });
      }
    }

    // Alunos com avaliação futura já marcada não recebem convite de avaliação vencida.
    const { data: futureEvals } = await supabase
      .from("evaluations")
      .select("student_id")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString());
    const studentsWithFutureEval = new Set(
      (futureEvals || []).map((e: any) => e.student_id),
    );

    // ---- 2) Lembretes de avaliação vencida ----
    let reminderInserts: any[] = [];
    let reminderCandidates: any[] = [];
    if (inviteOn) {
      const minIntervalDays = Number(
        getParam(settings, "evaluation_invite", "min_interval_days", 14),
      );
      const maxAttempts = Number(
        getParam(settings, "evaluation_invite", "max_attempts", 3),
      );

      // Histórico de convites já disparados: para respeitar intervalo e máx. tentativas.
      // Considera envios desde a última avaliação (ou desde sempre, se nunca fez).
      const { data: pastReminders } = await supabase
        .from("scheduled_messages")
        .select("student_id, scheduled_for, created_at")
        .eq("message_type", "evaluation_reminder")
        .in("status", ["pending", "sent"]);
      const historyByStudent = new Map<string, { last: number; count: number; sinceRef: number }>();
      for (const r of pastReminders ?? []) {
        const t = new Date(r.scheduled_for ?? r.created_at).getTime();
        const cur = historyByStudent.get(r.student_id) ?? { last: 0, count: 0, sinceRef: 0 };
        cur.last = Math.max(cur.last, t);
        historyByStudent.set(r.student_id, cur);
      }

      const nowMs = Date.now();
      reminderCandidates = activeStudents
        .filter((s) => {
          if (hasPending.has(`${s.id}:evaluation_reminder`)) return false;
          if (studentsWithFutureEval.has(s.id)) return false;
          if (s.last_evaluation_date) {
            if (daysSince(s.last_evaluation_date) <= daysOverdue) return false;
          } else {
            if (s.had_evaluation || daysSince(s.created_at) <= 14) return false;
          }
          // Só conta tentativas feitas DEPOIS da última avaliação (ou desde sempre, se nunca fez).
          const resetRef = s.last_evaluation_date
            ? new Date(s.last_evaluation_date).getTime()
            : 0;
          const attempts = (pastReminders ?? []).filter(
            (r: any) =>
              r.student_id === s.id &&
              new Date(r.scheduled_for ?? r.created_at).getTime() >= resetRef,
          ).length;
          if (attempts >= maxAttempts) return false;
          const h = historyByStudent.get(s.id);
          if (h && h.last > 0) {
            const daysSinceLast = (nowMs - h.last) / 86400000;
            if (daysSinceLast < minIntervalDays) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aRef = a.last_evaluation_date || a.created_at;
          const bRef = b.last_evaluation_date || b.created_at;
          return new Date(aRef).getTime() - new Date(bRef).getTime();
        });

      const remainingSlots = Math.max(0, dailyLimit - birthdayInserts.length);
      const picked = reminderCandidates.slice(0, remainingSlots);
      for (const s of picked) {
        const content = await resolveAutomationMessage(
          supabase, settings, "evaluation_invite", "evaluation_reminder",
          pick(REMINDER_TEMPLATES)(s.name), { nome: s.name },
        );
        reminderInserts.push({
          student_id: s.id,
          content,
          scheduled_for: scatterTimeToday().toISOString(),
          message_type: "evaluation_reminder",
          status: "pending",
        });
      }
    }

    // ---- 3) Lembretes de vencimento da mensalidade ----
    const paymentInserts: any[] = [];
    let paymentBeforeCount = 0;
    let paymentDueCount = 0;
    if (paymentOn) {
      const todaySP = spDateStrToday();
      const beforeTarget = addDaysISO(todaySP, paymentDaysBefore);

      for (const s of activeStudents) {
        if (paymentInserts.length >= paymentCap) break;
        if (!s.payment_due_date) continue;
        const due = String(s.payment_due_date);

        if (due === beforeTarget && !hasPending.has(`${s.id}:payment_reminder_before`)) {
          const content = await resolveAutomationMessage(
            supabase, settings, "payment_reminder", "payment_reminder_before",
            PAYMENT_BEFORE_TEMPLATE(s.name, paymentDaysBefore),
            { nome: s.name, dias: String(paymentDaysBefore) } as any,
          );
          paymentInserts.push({
            student_id: s.id,
            content,
            scheduled_for: scatterTimeToday().toISOString(),
            message_type: "payment_reminder_before",
            status: "pending",
          });
          paymentBeforeCount++;
          continue;
        }

        if (due === todaySP && !hasPending.has(`${s.id}:payment_reminder_due`)) {
          const content = await resolveAutomationMessage(
            supabase, settings, "payment_reminder", "payment_reminder_due",
            PAYMENT_DUE_TEMPLATE(s.name),
            { nome: s.name, dias: "0" } as any,
          );
          paymentInserts.push({
            student_id: s.id,
            content,
            scheduled_for: scatterTimeToday().toISOString(),
            message_type: "payment_reminder_due",
            status: "pending",
          });
          paymentDueCount++;
        }
      }
    }

    // ---- 4) Cobrança de mensalidade vencida ----
    const overdueInserts: any[] = [];
    if (overdueOn) {
      const todaySP = spDateStrToday();
      const overdueDaysAfter = Number(
        getParam(settings, "payment_overdue", "days_after_due", 1),
      );
      const overdueRepeatEvery = Number(
        getParam(settings, "payment_overdue", "repeat_every_days", 7),
      );

      // Última cobrança enviada/agendada por aluno (para respeitar o intervalo)
      const sinceISO = new Date(
        Date.now() - overdueRepeatEvery * 86400000,
      ).toISOString();
      const { data: recentOverdue } = await supabase
        .from("scheduled_messages")
        .select("student_id, scheduled_for")
        .eq("message_type", "payment_overdue")
        .gte("scheduled_for", sinceISO);
      const recentByStudent = new Set(
        (recentOverdue || []).map((r: any) => r.student_id),
      );

      for (const s of activeStudents) {
        if (overdueInserts.length >= paymentCap) break; // cap compartilhado com lembretes
        if (!s.payment_due_date) continue;
        const due = String(s.payment_due_date);
        if (due >= todaySP) continue; // ainda não venceu
        if (hasPending.has(`${s.id}:payment_overdue`)) continue;
        if (recentByStudent.has(s.id)) continue; // dentro do intervalo de repetição

        const daysLate = Math.max(
          1,
          Math.floor(
            (new Date(todaySP + "T00:00:00Z").getTime() -
              new Date(due + "T00:00:00Z").getTime()) / 86400000,
          ),
        );
        if (daysLate < overdueDaysAfter) continue;

        const content = await resolveAutomationMessage(
          supabase, settings, "payment_overdue", "payment_overdue",
          PAYMENT_OVERDUE_TEMPLATE(s.name, daysLate),
          { nome: s.name, dias: String(daysLate) } as any,
        );
        overdueInserts.push({
          student_id: s.id,
          content,
          scheduled_for: scatterTimeToday().toISOString(),
          message_type: "payment_overdue",
          status: "pending",
        });
      }
    }

    const allInserts = [...birthdayInserts, ...reminderInserts, ...paymentInserts, ...overdueInserts];

    let inserted = 0;
    if (allInserts.length > 0) {
      const { error, count } = await supabase
        .from("scheduled_messages")
        .insert(allInserts, { count: "exact" });
      if (error) throw error;
      inserted = count ?? allInserts.length;
    }

    const summary = {
      inserted,
      birthdays: birthdayInserts.length,
      reminders: reminderInserts.length,
      payment_before: paymentBeforeCount,
      payment_due: paymentDueCount,
      payment_overdue: overdueInserts.length,
      candidatesConsidered: reminderCandidates.length,
      dailyLimit,
      daysOverdue,
      paymentDaysBefore,
      birthdayEnabled: birthdayOn,
      inviteEnabled: inviteOn,
      paymentEnabled: paymentOn,
      overdueEnabled: overdueOn,
      activeStudents: activeStudents.length,
      ranAt: new Date().toISOString(),
    };
    console.log("daily-automation:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("daily-automation error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
