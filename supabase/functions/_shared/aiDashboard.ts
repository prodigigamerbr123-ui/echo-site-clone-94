import { dashboardSnapshot } from "./dashboardContracts.ts";

/** Use the caller's RLS snapshot; never derive totals from REST samples. */
export async function getAssistantDashboard(
  load: () => PromiseLike<{ data: unknown; error: unknown }>,
) {
  const { data, error } = await load();
  if (error) throw error;
  const snapshot = dashboardSnapshot(data);
  return {
    ...snapshot.stats,
    generatedAt: snapshot.generatedAt,
    day: snapshot.day,
    pendingScheduledMessages: snapshot.stats.scheduledMessages,
    birthdaysTodayCount: snapshot.stats.birthdaysToday,
    birthdayNames: snapshot.birthdayNames,
    birthdayNamesLimited: snapshot.stats.birthdaysToday > snapshot.birthdayNames.length,
    agenda: snapshot.agenda,
    agendaLimited: snapshot.stats.evaluationsToday > snapshot.agenda.length,
    criteria: {
      timeZone: "America/Sao_Paulo",
      studentsWithoutEvaluation: "Somente alunos ativos com had_evaluation=false; inativos não entram.",
      pendingScheduledMessages: "Mensagens pendentes agendadas do momento da consulta até as próximas 24 horas; não é o total da fila.",
      payments: "Somente alunos ativos; vencidas antes de hoje, próximas de hoje até três dias.",
      evaluationsOverdue: "Compromissos agendados antes de hoje que ainda não foram fechados; não é prazo para reavaliação.",
      messagesSentToday: "Envios aceitos pelo provedor; não confirma entrega ou leitura.",
      samples: "Agenda e nomes dos aniversariantes limitados a 20. Contagens são completas.",
    },
  };
}
