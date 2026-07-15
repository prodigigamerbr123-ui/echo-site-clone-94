// Templates e helpers pras automações "welcome" e "reengagement".
// Ambas seguem o padrão de sortear entre 3 variações de texto.

import { supabase } from "@/integrations/supabase/client";
import {
  fetchAutomationSettings,
  getAutomationParam,
} from "@/lib/automationSettings";

const WELCOME_TEMPLATES = [
  (n: string) =>
    `Oi ${n}! 🎉 Que bom te ter com a gente! Bora marcar sua primeira avaliação física? Ajuda a montar seu treino do jeito certo.`,
  (n: string) =>
    `Bem-vindo(a), ${n}! 💪 Pra começar com o pé direito, que tal agendar sua avaliação física? Assim conhecemos seus objetivos.`,
  (n: string) =>
    `E aí ${n}! 👋 Vamos combinar sua avaliação física? É rapidinho e a base pra tudo dar certo daqui pra frente.`,
];

const REENGAGEMENT_TEMPLATES = [
  (n: string) =>
    `Oi ${n}! Sentimos sua falta por aqui 💛 Bora voltar aos treinos? Qualquer dúvida ou horário melhor pra você, me chama!`,
  (n: string) =>
    `${n}, tá com saudade da academia 😉 Vem que a gente te espera! Me diz o que precisa pra retomar.`,
  (n: string) =>
    `E aí ${n}! Faz um tempo que a gente não te vê 💪 Bora marcar uma visita e voltar pra ativa?`,
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const buildWelcome = (name: string) => pick(WELCOME_TEMPLATES)(name);
export const buildReengagement = (name: string) =>
  pick(REENGAGEMENT_TEMPLATES)(name);

/**
 * Se `welcome_message` estiver ligada, agenda uma mensagem de boas-vindas
 * para ~5 min depois do cadastro. Silencioso em caso de falha (o cadastro
 * do aluno é o essencial).
 */
export async function scheduleWelcomeIfEnabled(
  studentId: string,
  studentName: string,
): Promise<boolean> {
  try {
    const map = await fetchAutomationSettings();
    if (!map.welcome_message?.enabled) return false;
    const when = new Date(Date.now() + 5 * 60 * 1000);
    const { error } = await supabase.from("scheduled_messages").insert({
      student_id: studentId,
      content: buildWelcome(studentName),
      scheduled_for: when.toISOString(),
      message_type: "welcome",
      status: "pending",
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("scheduleWelcomeIfEnabled:", e);
    return false;
  }
}

/**
 * Se `reengagement` estiver ligada, agenda a mensagem "sentimos sua falta"
 * para `days_after` dias depois, em horário aleatório 09-12h (Brasília).
 */
export async function scheduleReengagementIfEnabled(
  studentId: string,
  studentName: string,
): Promise<boolean> {
  try {
    const map = await fetchAutomationSettings();
    if (!map.reengagement?.enabled) return false;
    const days = await getAutomationParam("reengagement", "days_after", 20);
    const target = new Date(Date.now() + days * 86400_000);
    // 09..12 BRT = 12..15 UTC (Brasil sem DST)
    target.setUTCHours(12 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
    const { error } = await supabase.from("scheduled_messages").insert({
      student_id: studentId,
      content: buildReengagement(studentName),
      scheduled_for: target.toISOString(),
      message_type: "reengagement",
      status: "pending",
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("scheduleReengagementIfEnabled:", e);
    return false;
  }
}
