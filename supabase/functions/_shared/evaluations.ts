// Lógica compartilhada de avaliações físicas — precisa ficar em paridade
// exata com src/lib/evaluationMessages.ts e src/pages/AgendarAvaliacao.tsx.
//
// Regras replicadas:
//  - createEvaluationWithMessages: cria evaluation + até 3 mensagens
//    (confirmação agora+2min, véspera 18:00 SP, dia -3h).
//  - Trava de duplicidade: aluno com evaluation 'scheduled' futura.
//  - Trava de conflito: outra evaluation em raio de 30 min.
//  - completeEvaluation: atualiza had_evaluation + last_evaluation_date,
//    deleta mensagens pendentes vinculadas, agenda follow-up 7d (sem dup).
//  - noShowEvaluation: status no_show, deleta pendentes, agenda remarcação
//    para amanhã 09-12h.

// Brasil (sem DST) = UTC-3. Fixo para manter paridade com o browser em SP.
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function spParts(d: Date) {
  const s = new Date(d.getTime() + SP_OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    mo: s.getUTCMonth(),
    d: s.getUTCDate(),
    h: s.getUTCHours(),
    mi: s.getUTCMinutes(),
  };
}
function spDate(y: number, mo: number, d: number, h: number, mi: number) {
  // Data UTC que representa (y-mo-d h:mi) horário SP
  return new Date(Date.UTC(y, mo, d, h, mi) - SP_OFFSET_MS);
}
function fmtDateSP(d: Date) {
  const p = spParts(d);
  return `${pad(p.d)}/${pad(p.mo + 1)}`;
}
function fmtTimeSP(d: Date) {
  const p = spParts(d);
  return `${pad(p.h)}:${pad(p.mi)}`;
}
function fmtDateISOSP(d: Date) {
  const p = spParts(d);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`;
}

type Tpl = (n: string, w: Date) => string;

const CONFIRMATION_TEMPLATES: Tpl[] = [
  (n, w) => `Olá ${n}! ✅ Sua avaliação física está marcada para ${fmtDateSP(w)} às ${fmtTimeSP(w)}. Qualquer imprevisto, é só me avisar!`,
  (n, w) => `Oi ${n}! 📅 Confirmado: avaliação física em ${fmtDateSP(w)} às ${fmtTimeSP(w)}. Te espero! 💪`,
  (n, w) => `${n}, tudo certo! ✅ Sua avaliação está agendada pra ${fmtDateSP(w)} às ${fmtTimeSP(w)}. Se precisar remarcar é só falar.`,
];
const REMINDER_1D_TEMPLATES: Tpl[] = [
  (n, w) => `Oi ${n}! 👋 Passando pra lembrar da sua avaliação física amanhã às ${fmtTimeSP(w)}. Bora acompanhar sua evolução!`,
  (n, w) => `${n}, amanhã é dia! 📋 Sua avaliação física está marcada pra ${fmtTimeSP(w)}. Te vejo lá! 💪`,
  (n, w) => `Lembrete rápido, ${n}: amanhã tem avaliação física às ${fmtTimeSP(w)}. Qualquer coisa é só me chamar. ✅`,
];
const REMINDER_DAY_TEMPLATES: Tpl[] = [
  (n, w) => `Oi ${n}! ⏰ Sua avaliação física é hoje às ${fmtTimeSP(w)}. Já já te vejo! 💪`,
  (n, w) => `${n}, tá chegando a hora! 🏋️ Avaliação física hoje às ${fmtTimeSP(w)}. Te espero!`,
  (n, w) => `Lembrete de hoje, ${n}: avaliação física às ${fmtTimeSP(w)}. Se precisar remarcar, me avisa!`,
];
const FOLLOWUP_TEMPLATES = [
  (n: string) => `Olá ${n}! 📈 Como foi sua avaliação física? Vamos acompanhar sua evolução juntos! 💪`,
  (n: string) => `E aí ${n}! Passando pra saber como você está depois da avaliação. Bora ajustar o que precisar! 🏋️`,
  (n: string) => `${n}, tudo certo? Já se passou uma semana da sua avaliação — conta pra gente como está o treino! 💪`,
];
const RESCHEDULE_TEMPLATES = [
  (n: string) => `Oi ${n}! Sentimos sua falta na avaliação ontem 😊 Vamos remarcar? Me fala qual dia fica melhor pra você!`,
  (n: string) => `${n}, notamos que você não conseguiu vir na avaliação. 📅 Sem problema — quando podemos remarcar?`,
  (n: string) => `E aí ${n}! Ficamos com saudades ontem. Bora reagendar sua avaliação física? Me diz o melhor dia!`,
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface EvaluationAutoMessage {
  scheduled_for: string;
  message_type: string;
  content: string;
}

export function buildEvaluationMessages(
  studentName: string,
  scheduledAt: Date,
): EvaluationAutoMessage[] {
  const now = new Date();
  const msgs: EvaluationAutoMessage[] = [];

  // 1) Confirmação: agora + 2 min
  const confirmAt = new Date(now.getTime() + 2 * 60 * 1000);
  msgs.push({
    scheduled_for: confirmAt.toISOString(),
    message_type: "evaluation_confirmation",
    content: pick(CONFIRMATION_TEMPLATES)(studentName, scheduledAt),
  });

  // 2) Véspera 18:00 SP
  const p = spParts(scheduledAt);
  // "dia anterior em SP" — construímos via Date UTC para lidar com virada de mês
  const eveTmp = new Date(Date.UTC(p.y, p.mo, p.d - 1)); // meia-noite UTC (irrelevante)
  const eveParts = {
    y: eveTmp.getUTCFullYear(),
    mo: eveTmp.getUTCMonth(),
    d: eveTmp.getUTCDate(),
  };
  const eve = spDate(eveParts.y, eveParts.mo, eveParts.d, 18, 0);
  const eveInFuture = eve.getTime() > now.getTime();

  // 3) Dia -3h
  const dayOf = new Date(scheduledAt.getTime() - 3 * 60 * 60 * 1000);
  const dayOfInFuture = dayOf.getTime() > now.getTime();

  const collision = dayOf.getTime() - eve.getTime() < 12 * 60 * 60 * 1000;

  if (eveInFuture && !collision) {
    msgs.push({
      scheduled_for: eve.toISOString(),
      message_type: "evaluation_reminder_1d",
      content: pick(REMINDER_1D_TEMPLATES)(studentName, scheduledAt),
    });
  }
  if (dayOfInFuture) {
    msgs.push({
      scheduled_for: dayOf.toISOString(),
      message_type: "evaluation_reminder_day",
      content: pick(REMINDER_DAY_TEMPLATES)(studentName, scheduledAt),
    });
  }

  return msgs;
}

export const AUTO_EVAL_MESSAGE_TYPES = [
  "evaluation_confirmation",
  "evaluation_reminder_1d",
  "evaluation_reminder_day",
  "evaluation_followup",
  "evaluation_reschedule",
] as const;

// -------- Travas de pré-agendamento --------

export interface ScheduleConflictCheck {
  duplicate?: {
    evaluation_id: string;
    scheduled_at: string;
  };
  conflict?: {
    evaluation_id: string;
    student_name: string;
    scheduled_at: string;
  };
}

export async function checkScheduleConflicts(
  supabase: any,
  studentId: string,
  scheduledAt: Date,
): Promise<ScheduleConflictCheck> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const { data: futureEvals } = await supabase
    .from("evaluations")
    .select("id, student_id, scheduled_at, students(name)")
    .eq("status", "scheduled")
    .gte("scheduled_at", startOfToday.toISOString());

  const res: ScheduleConflictCheck = {};
  const target = scheduledAt.getTime();

  for (const ev of futureEvals || []) {
    if (ev.student_id === studentId) {
      res.duplicate = { evaluation_id: ev.id, scheduled_at: ev.scheduled_at };
    }
    const d = new Date(ev.scheduled_at).getTime();
    if (Math.abs(d - target) < 30 * 60 * 1000 && ev.student_id !== studentId) {
      res.conflict = {
        evaluation_id: ev.id,
        student_name: ev.students?.name ?? "outro aluno",
        scheduled_at: ev.scheduled_at,
      };
    }
  }
  return res;
}

// -------- Ações principais --------

export async function createEvaluationWithMessages(
  supabase: any,
  studentId: string,
  scheduledAt: Date,
  notes: string | null,
): Promise<{ evaluation_id: string; messages_created: number }> {
  const { data: student, error: sErr } = await supabase
    .from("students").select("id, name").eq("id", studentId).single();
  if (sErr || !student) throw new Error("Aluno não encontrado");

  const { data: created, error } = await supabase
    .from("evaluations")
    .insert({
      student_id: studentId,
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
      notes: notes || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const auto = buildEvaluationMessages(student.name, scheduledAt);
  if (auto.length > 0) {
    const { error: mErr } = await supabase.from("scheduled_messages").insert(
      auto.map((m) => ({
        student_id: studentId,
        content: m.content,
        scheduled_for: m.scheduled_for,
        message_type: m.message_type,
        status: "pending",
        evaluation_id: created.id,
      })),
    );
    if (mErr) throw mErr;
  }

  return { evaluation_id: created.id, messages_created: auto.length };
}

async function deletePendingEvalMessages(supabase: any, evaluationId: string) {
  await supabase
    .from("scheduled_messages")
    .delete()
    .eq("evaluation_id", evaluationId)
    .eq("status", "pending");
}

export async function completeEvaluation(
  supabase: any,
  evaluationId: string,
): Promise<{ followup_scheduled: boolean }> {
  const { data: ev, error } = await supabase
    .from("evaluations")
    .select("id, student_id, scheduled_at, students(name)")
    .eq("id", evaluationId).single();
  if (error || !ev) throw new Error("Avaliação não encontrada");

  await deletePendingEvalMessages(supabase, evaluationId);

  const evalDate = new Date(ev.scheduled_at);
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("evaluations").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", evaluationId),
    supabase.from("students").update({
      had_evaluation: true,
      last_evaluation_date: fmtDateISOSP(evalDate),
    }).eq("id", ev.student_id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  // Follow-up 7d — evitar duplicidade
  const { data: existingFu } = await supabase
    .from("scheduled_messages")
    .select("id")
    .eq("student_id", ev.student_id)
    .eq("message_type", "evaluation_followup")
    .eq("status", "pending")
    .limit(1);

  if (!existingFu || existingFu.length === 0) {
    const followup = new Date(evalDate.getTime() + 7 * 86400000);
    // 9-12h SP com minutos aleatórios
    const fp = spParts(followup);
    const followupSp = spDate(
      fp.y, fp.mo, fp.d,
      9 + Math.floor(Math.random() * 3),
      Math.floor(Math.random() * 60),
    );
    await supabase.from("scheduled_messages").insert({
      student_id: ev.student_id,
      content: pick(FOLLOWUP_TEMPLATES)(ev.students?.name ?? "aluno"),
      scheduled_for: followupSp.toISOString(),
      message_type: "evaluation_followup",
      status: "pending",
      evaluation_id: evaluationId,
    });
    return { followup_scheduled: true };
  }
  return { followup_scheduled: false };
}

export async function noShowEvaluation(
  supabase: any,
  evaluationId: string,
): Promise<void> {
  const { data: ev, error } = await supabase
    .from("evaluations")
    .select("id, student_id, students(name)")
    .eq("id", evaluationId).single();
  if (error || !ev) throw new Error("Avaliação não encontrada");

  await deletePendingEvalMessages(supabase, evaluationId);

  const { error: uErr } = await supabase
    .from("evaluations").update({ status: "no_show" }).eq("id", evaluationId);
  if (uErr) throw uErr;

  // Mensagem de remarcação amanhã 09-12h SP
  const now = new Date();
  const tomorrowUTC = new Date(now.getTime() + 86400000);
  const tp = spParts(tomorrowUTC);
  const tomorrowSp = spDate(
    tp.y, tp.mo, tp.d,
    9 + Math.floor(Math.random() * 3),
    Math.floor(Math.random() * 60),
  );
  await supabase.from("scheduled_messages").insert({
    student_id: ev.student_id,
    content: pick(RESCHEDULE_TEMPLATES)(ev.students?.name ?? "aluno"),
    scheduled_for: tomorrowSp.toISOString(),
    message_type: "evaluation_reschedule",
    status: "pending",
    evaluation_id: evaluationId,
  });
}
