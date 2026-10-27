import { enqueueMessages } from "@/lib/messageQueue";
import { fetchAutomationSettings, isAutomationEnabled, getAutomationParam } from "@/lib/automationSettings";
import { resolveAutomationMessage } from "@/lib/messageTemplates";

const WELCOME_TEMPLATES = [
  (n: string) => `Oi ${n}! 👋 Seja muito bem-vindo(a) à academia! Bora agendar sua primeira avaliação física pra montarmos seu plano de treino? 💪`,
  (n: string) => `${n}, que alegria ter você com a gente! 🎉 Pra começarmos com o pé direito, vamos marcar sua avaliação física? Me avisa o melhor dia!`,
  (n: string) => `Bem-vindo(a), ${n}! 🏋️ O primeiro passo é sua avaliação física — assim conseguimos acompanhar sua evolução desde o início. Quando fica bom pra você?`,
];

const REENGAGEMENT_TEMPLATES = [
  (n: string) => `Oi ${n}! Faz um tempinho que a gente não te vê por aqui e sentimos sua falta 😊 Bora retomar os treinos?`,
  (n: string) => `${n}, tudo bem? 💭 A gente tá com saudade! Que tal voltar a treinar com a gente? Me avisa o que precisar pra retomar.`,
  (n: string) => `E aí ${n}! Notamos que você tá afastado(a) faz um tempo. 🏋️ Bora marcar sua volta? Estamos aqui pra ajudar no que precisar!`,
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export async function scheduleWelcomeIfEnabled(studentId: string, name: string): Promise<"queued" | "disabled" | "failed"> {
  try {
    const settings = await fetchAutomationSettings();
    if (!isAutomationEnabled(settings, "welcome_message")) return "disabled";
    const when = new Date(Date.now() + 5 * 60 * 1000);
    const fallback = pick(WELCOME_TEMPLATES)(name);
    const content = await resolveAutomationMessage(
      "welcome_message",
      "welcome",
      fallback,
      { nome: name },
      settings,
    );
    const result = await enqueueMessages([studentId], content, { kind: "at", scheduled_for: when.toISOString(), message_type: "welcome" }, "welcome");
    return result.queued > 0 ? "queued" : "failed";
  } catch {
    return "failed";
  }
}

export async function scheduleReengagementIfEnabled(studentId: string, name: string): Promise<"queued" | "disabled" | "failed"> {
  try {
    const settings = await fetchAutomationSettings();
    if (!isAutomationEnabled(settings, "reengagement")) return "disabled";

    const daysAfter = Number(getAutomationParam(settings, "reengagement", "days_after", 20));
    if (!Number.isInteger(daysAfter) || daysAfter < 1 || daysAfter > 365) throw new Error("Intervalo de reativação inválido");
    const when = new Date(Date.now() + daysAfter * 86400000);
    // 09-12h Brasília = 12-15h UTC
    when.setUTCHours(12 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);

    const fallback = pick(REENGAGEMENT_TEMPLATES)(name);
    const content = await resolveAutomationMessage(
      "reengagement",
      "reengagement",
      fallback,
      { nome: name },
      settings,
    );

    const result = await enqueueMessages([studentId], content, { kind: "at", scheduled_for: when.toISOString(), message_type: "reengagement" }, "reengagement");
    return result.queued > 0 ? "queued" : "failed";
  } catch (e) {
    console.error("scheduleReengagementIfEnabled error:", e);
    return "failed";
  }
}
