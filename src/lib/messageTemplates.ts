// Helpers para resolver o texto de mensagens automáticas.
// Se o usuário linkou uma mensagem pré-definida ao par (automação, tipo),
// usa o conteúdo dela com placeholders {nome}, {data}, {hora}.
// Caso contrário, devolve o fallback (as variações padrão que já existem).

import { supabase } from "@/integrations/supabase/client";
import { fetchAutomationSettings, AutomationSettingsMap } from "@/lib/automationSettings";

export type TemplateVars = {
  nome?: string;
  data?: string;
  hora?: string;
  dias?: string;
  [key: string]: string | undefined;
};

export function interpolate(text: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    nome: vars.nome ?? "",
    name: vars.nome ?? "",
    aluno: vars.nome ?? "",
    data: vars.data ?? "",
    date: vars.data ?? "",
    hora: vars.hora ?? "",
    time: vars.hora ?? "",
    dias: vars.dias ?? "",
    days: vars.dias ?? "",
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    const key = String(k).toLowerCase();
    if (key in map) return map[key];
    const extra = vars[key];
    return extra !== undefined ? String(extra) : m;
  });
}


export function getLinkedTemplateId(
  settings: AutomationSettingsMap | undefined,
  automationKey: string,
  messageType: string,
): string | null {
  const t = settings?.[automationKey]?.params?.templates;
  const id = t && typeof t === "object" ? (t as Record<string, string>)[messageType] : null;
  return id && typeof id === "string" ? id : null;
}

const contentCache = new Map<string, string | null>();

async function getPredefinedContent(id: string): Promise<string | null> {
  if (contentCache.has(id)) return contentCache.get(id)!;
  const { data } = await supabase
    .from("predefined_messages")
    .select("content")
    .eq("id", id)
    .maybeSingle();
  const content = data?.content ?? null;
  contentCache.set(id, content);
  return content;
}

export function invalidateTemplateCache() {
  contentCache.clear();
}

/**
 * Devolve o texto final a ser enviado para (automationKey, messageType).
 * Se houver uma mensagem pré-definida linkada, usa ela com placeholders.
 * Caso contrário, retorna `fallback` sem modificar.
 */
export async function resolveAutomationMessage(
  automationKey: string,
  messageType: string,
  fallback: string,
  vars: TemplateVars,
  settings?: AutomationSettingsMap,
): Promise<string> {
  const s = settings ?? (await fetchAutomationSettings());
  const id = getLinkedTemplateId(s, automationKey, messageType);
  if (!id) return fallback;
  const content = await getPredefinedContent(id);
  if (!content) return fallback;
  return interpolate(content, vars);
}
