import { isRecord } from "./contracts.ts";

const countKeys = ["totalStudents", "activeStudents", "inactiveStudents", "newStudentsMonth",
  "evaluationsToday", "evaluationsWeek", "evaluationsMonth", "evaluationsOverdue", "evaluationsCompletedMonth",
  "studentsWithoutEvaluation", "birthdaysToday", "paymentOverdueCount", "paymentDueIn3DaysCount"] as const;
const messageKeys = ["messagesToSendToday", "scheduledMessages", "messagesSentToday"] as const;
export type DashboardStats = Record<typeof countKeys[number], number> & Record<typeof messageKeys[number], number | null>;
export interface TodayAction {
  id: string; name: string; phone: string; action: string;
  type: "birthday" | "evaluation" | "daqui_7_dias" | "daqui_21_dias";
}
export interface DashboardSnapshot {
  version: 1; generatedAt: string; day: string; stats: DashboardStats; actions: TodayAction[];
  agenda: { id: string; name: string; scheduled_at: string }[]; birthdayNames: string[];
}
function invalid(): never { throw new Error("Não foi possível confirmar os dados do painel. Atualize e tente novamente."); }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

export function dashboardSnapshot(value: unknown): DashboardSnapshot {
  if (!isRecord(value) || value.version !== 1 || !timestamp(value.generatedAt) ||
      typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !isRecord(value.stats)) invalid();
  const stats = value.stats;
  if (!countKeys.every(key => count(stats[key])) ||
      !messageKeys.every(key => stats[key] === null || count(stats[key]))) invalid();
  if (!Array.isArray(value.actions) || !value.actions.every(a => isRecord(a) &&
      ["id", "name", "phone", "action"].every(key => typeof a[key] === "string") &&
      ["birthday", "evaluation", "daqui_7_dias", "daqui_21_dias"].includes(String(a.type)))) invalid();
  if (!Array.isArray(value.agenda) || value.agenda.length > 20 || !value.agenda.every(a =>
      isRecord(a) && typeof a.id === "string" && typeof a.name === "string" && timestamp(a.scheduled_at))) invalid();
  if (!Array.isArray(value.birthdayNames) || value.birthdayNames.length > 20 ||
      !value.birthdayNames.every(name => typeof name === "string")) invalid();
  return value as unknown as DashboardSnapshot;
}

/** Samples are labelled so the model cannot mistake 20 names for the total. */
export function briefingContext(snapshot: DashboardSnapshot) {
  const { stats } = snapshot;
  return {
    dataHora: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(new Date(snapshot.generatedAt)),
    totalAlunos: stats.totalStudents, alunosAtivos: stats.activeStudents, alunosSemAvaliacao: stats.studentsWithoutEvaluation,
    avaliacoesHoje: stats.evaluationsToday, avaliacoesAtrasadas: stats.evaluationsOverdue,
    agendaHoje: snapshot.agenda.map(e => `${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(e.scheduled_at))} - ${e.name}`),
    agendaHojeLimitada: stats.evaluationsToday > snapshot.agenda.length,
    mensagensAgendadasHoje: stats.messagesToSendToday, mensagensEnviadasHoje: stats.messagesSentToday,
    criterioMensagensEnviadas: "Envios aceitos pelo provedor; não confirma entrega ou leitura.",
    totalAniversariantesAtivos: stats.birthdaysToday, aniversariantes: snapshot.birthdayNames,
    aniversariantesLimitados: stats.birthdaysToday > snapshot.birthdayNames.length,
  };
}
