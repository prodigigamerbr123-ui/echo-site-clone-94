import { supabase } from "@/integrations/supabase/client";
import { fetchAutomationSettings, isAutomationEnabled, getAutomationParam } from "@/lib/automationSettings";

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

export async function scheduleWelcomeIfEnabled(studentId: string, name: string): Promise<void> {
  try {
    const settings = await fetchAutomationSettings();
    if (!isAutomationEnabled(settings, "welcome_message")) return;
    const when = new Date(Date.now() + 5 * 60 * 1000);
    const { error } = await supabase.from("scheduled_messages").insert({
      student_id: studentId,
      content: pick(WELCOME_TEMPLATES)(name),
      scheduled_for: when.toISOString(),
      message_type: "welcome",
      status: "pending",
    });
    if (error) console.error("scheduleWelcomeIfEnabled insert error:", error);
  } catch (e) {
    console.error("scheduleWelcomeIfEnabled error:", e);
  }
}

export async function scheduleReengagementIfEnabled(studentId: string, name: string): Promise<void> {
  try {
    const settings = await fetchAutomationSettings();
    if (!isAutomationEnabled(settings, "reengagement")) return;

    const { data: existing } = await supabase
      .from("scheduled_messages")
      .select("id")
      .eq("student_id", studentId)
      .eq("message_type", "reengagement")
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) return;

    const daysAfter = Number(getAutomationParam(settings, "reengagement", "days_after", 20));
    const when = new Date(Date.now() + daysAfter * 86400000);
    // 09-12h Brasília = 12-15h UTC
    when.setUTCHours(12 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);

    const { error } = await supabase.from("scheduled_messages").insert({
      student_id: studentId,
      content: pick(REENGAGEMENT_TEMPLATES)(name),
      scheduled_for: when.toISOString(),
      message_type: "reengagement",
      status: "pending",
    });
    if (error) console.error("scheduleReengagementIfEnabled insert error:", error);
  } catch (e) {
    console.error("scheduleReengagementIfEnabled error:", e);
  }
}
