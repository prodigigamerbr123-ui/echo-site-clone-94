// Motor de regras que roda 1x/dia (via pg_cron) e agenda mensagens automáticas.
// - Lembretes de avaliação vencida (>90 dias) ou pendente (>14 dias após cadastro)
// - Aniversários
// - Distribui horários entre 09:00 e 12:00 para não disparar em massa
// - Sorteia entre 3 variações de texto por tipo
// - Limita a 60 novos agendamentos por execução
// - Só considera alunos com status 'active'

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_DAILY_LIMIT = 60;
const DEFAULT_DAYS_OVERDUE = 90;

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
  const s = map[key];
  return s ? s.enabled : true;
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Retorna uma data hoje entre 09:00 e 12:00 (horário do servidor Brasília via TZ set)
function scatterTimeToday(): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0); // meio dia UTC ~ 09:00 BRT (aprox); ajusta pra 09-12 BRT
  // 09..12 BRT == 12..15 UTC
  const hourUTC = 12 + Math.floor(Math.random() * 3);
  const min = Math.floor(Math.random() * 60);
  d.setUTCHours(hourUTC, min, 0, 0);
  // Se já passou (a função roda 08:00 BRT = 11:00 UTC, então tudo estará no futuro)
  return d;
}

function isBirthdayToday(birth: string | null): boolean {
  if (!birth) return false;
  const b = new Date(birth);
  const now = new Date();
  return b.getUTCMonth() === now.getUTCMonth() && b.getUTCDate() === now.getUTCDate();
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Carrega todos os alunos ativos (pagina para passar do limite 1000)
    const activeStudents: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, birth_date, last_evaluation_date, had_evaluation, created_at, status")
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
      .in("message_type", ["evaluation_reminder", "birthday"]);
    const hasPending = new Set(
      (pendings || []).map((p: any) => `${p.student_id}:${p.message_type}`),
    );

    // ---- 1) Aniversariantes de hoje ----
    const birthdayInserts: any[] = [];
    for (const s of activeStudents) {
      if (!isBirthdayToday(s.birth_date)) continue;
      if (hasPending.has(`${s.id}:birthday`)) continue;
      birthdayInserts.push({
        student_id: s.id,
        content: pick(BIRTHDAY_TEMPLATES)(s.name),
        scheduled_for: scatterTimeToday().toISOString(),
        message_type: "birthday",
        status: "pending",
      });
    }

    // Alunos com avaliação futura já marcada (evaluations.status='scheduled')
    // NÃO devem receber convite de avaliação vencida.
    const { data: futureEvals } = await supabase
      .from("evaluations")
      .select("student_id")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString());
    const studentsWithFutureEval = new Set(
      (futureEvals || []).map((e: any) => e.student_id),
    );

    // ---- 2) Lembretes de avaliação vencida ----
    const reminderCandidates = activeStudents
      .filter((s) => {
        if (hasPending.has(`${s.id}:evaluation_reminder`)) return false;
        if (studentsWithFutureEval.has(s.id)) return false;
        if (s.last_evaluation_date) {
          return daysSince(s.last_evaluation_date) > 90;
        }
        // Nunca avaliado, cadastrado há >14 dias
        return !s.had_evaluation && daysSince(s.created_at) > 14;
      })
      // Prioriza os mais antigos primeiro
      .sort((a, b) => {
        const aRef = a.last_evaluation_date || a.created_at;
        const bRef = b.last_evaluation_date || b.created_at;
        return new Date(aRef).getTime() - new Date(bRef).getTime();
      });

    const remainingSlots = Math.max(0, DAILY_LIMIT - birthdayInserts.length);
    const reminderInserts = reminderCandidates.slice(0, remainingSlots).map((s) => ({
      student_id: s.id,
      content: pick(REMINDER_TEMPLATES)(s.name),
      scheduled_for: scatterTimeToday().toISOString(),
      message_type: "evaluation_reminder",
      status: "pending",
    }));

    const allInserts = [...birthdayInserts, ...reminderInserts];

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
      candidatesConsidered: reminderCandidates.length,
      dailyLimit: DAILY_LIMIT,
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
