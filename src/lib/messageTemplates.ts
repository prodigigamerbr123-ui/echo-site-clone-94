// Helpers para resolver o texto de mensagens automáticas.
// Se o usuário linkou uma mensagem pré-definida ao par (automação, tipo),
// usa o conteúdo dela com placeholders {nome}, {data}, {hora}.
// Caso contrário, devolve o fallback (as variações padrão que já existem).

import { supabase } from "@/integrations/supabase/client";
import { fetchAutomationSettings, AutomationSettingsMap } from "@/lib/automationSettings";
import { interpolate, type TemplateVars } from "../../supabase/functions/_shared/templateResolver";
export { interpolate, type TemplateVars } from "../../supabase/functions/_shared/templateResolver";

export function getLinkedTemplateId(
  settings: AutomationSettingsMap | undefined,
  automationKey: string,
  messageType: string,
): string | null {
  const t = settings?.[automationKey]?.params?.templates;
  const id = t && typeof t === "object" && !Array.isArray(t) ? t[messageType] : null;
  return id && typeof id === "string" ? id : null;
}

async function getPredefinedContent(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("predefined_messages")
    .select("content")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.content ?? null;
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
