// Helpers para ler/gravar automation_settings do lado do cliente.
// Cada operação de agendamento faz uma leitura direta (uma linha por key),
// então não vale a pena montar cache complexo — mas expomos uma queryKey
// estável pra quem quiser via React Query.

import { supabase } from "@/integrations/supabase/client";

export type AutomationKey =
  | "evaluation_invite"
  | "birthday"
  | "evaluation_reminders"
  | "evaluation_followup"
  | "no_show_reschedule"
  | "welcome_message"
  | "reengagement";

export interface AutomationSetting {
  key: AutomationKey;
  enabled: boolean;
  params: Record<string, any>;
}

export const AUTOMATION_SETTINGS_QUERY_KEY = ["automation-settings"] as const;

export async function fetchAutomationSettings(): Promise<
  Record<string, AutomationSetting>
> {
  const { data, error } = await supabase
    .from("automation_settings")
    .select("key, enabled, params");
  if (error) throw error;
  const map: Record<string, AutomationSetting> = {};
  for (const row of data || []) {
    map[row.key] = {
      key: row.key as AutomationKey,
      enabled: !!row.enabled,
      params: (row.params as Record<string, any>) || {},
    };
  }
  return map;
}

export async function isAutomationEnabled(key: AutomationKey): Promise<boolean> {
  const map = await fetchAutomationSettings();
  return map[key]?.enabled ?? false;
}

export async function getAutomationParam(
  key: AutomationKey,
  name: string,
  fallback: number,
): Promise<number> {
  const map = await fetchAutomationSettings();
  const v = map[key]?.params?.[name];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
