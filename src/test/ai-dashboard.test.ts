import { describe, expect, it, vi } from "vitest";
import { getAssistantDashboard } from "../../supabase/functions/_shared/aiDashboard";

function fixture() {
  const keys = ["totalStudents", "activeStudents", "inactiveStudents", "newStudentsMonth",
    "evaluationsToday", "evaluationsWeek", "evaluationsMonth", "evaluationsOverdue",
    "evaluationsCompletedMonth", "studentsWithoutEvaluation", "birthdaysToday",
    "paymentOverdueCount", "paymentDueIn3DaysCount", "messagesToSendToday", "scheduledMessages", "messagesSentToday"];
  return { version: 1, generatedAt: "2026-10-13T02:59:59Z", day: "2026-10-12",
    stats: { ...Object.fromEntries(keys.map(k => [k, 0])), totalStudents: 1505,
      studentsWithoutEvaluation: 1005, birthdaysToday: 25, messagesSentToday: 7,
      scheduledMessages: 3, paymentOverdueCount: 9 },
    actions: [], agenda: [], birthdayNames: Array.from({ length: 20 }, (_, i) => `Aluno ${i}`) };
}

describe("IA consulta o snapshot do painel", () => {
  it("preserva contagens completas e o dia de São Paulo, rotulando amostras e critérios", async () => {
    const load = vi.fn().mockResolvedValue({ data: fixture(), error: null });
    const result = await getAssistantDashboard(load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ totalStudents: 1505, studentsWithoutEvaluation: 1005,
      messagesSentToday: 7, pendingScheduledMessages: 3, paymentOverdueCount: 9,
      day: "2026-10-12", birthdaysTodayCount: 25, birthdayNamesLimited: true });
    expect(result.birthdayNames).toHaveLength(20);
    expect(result.criteria.studentsWithoutEvaluation).toContain("incluindo inativos");
    expect(result.criteria.pendingScheduledMessages).toContain("24 horas");
    expect(result.criteria.messagesSentToday).toContain("não confirma entrega");
  });

  it("preserva valores indisponíveis e não os transforma em zero", async () => {
    const data = fixture();
    const result = await getAssistantDashboard(async () => ({ data: {
      ...data, stats: { ...data.stats, messagesSentToday: null, scheduledMessages: null },
    }, error: null }));
    expect(result.messagesSentToday).toBeNull();
    expect(result.pendingScheduledMessages).toBeNull();
  });

  it("propaga falha do banco e recusa resposta incompleta", async () => {
    const error = new Error("fixture database unavailable");
    await expect(getAssistantDashboard(async () => ({ data: null, error }))).rejects.toBe(error);
    await expect(getAssistantDashboard(async () => ({ data: { version: 1 }, error: null }))).rejects.toThrow();
  });
});
