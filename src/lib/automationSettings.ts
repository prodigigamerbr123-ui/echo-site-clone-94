import { supabase } from "@/integrations/supabase/client";

export type AutomationSetting = {
  key: string;
  enabled: boolean;
  params: Record<string, any>;
};

export type AutomationSettingsMap = Record<string, AutomationSetting>;

export async function fetchAutomationSettings(): Promise<AutomationSettingsMap> {
  const { data, error } = await supabase
    .from("automation_settings")
    .select("key, enabled, params");
  if (error) throw error;
  const map: AutomationSettingsMap = {};
  for (const row of data ?? []) {
    map[row.key] = {
      key: row.key,
      enabled: !!row.enabled,
      params: (row.params as Record<string, any>) ?? {},
    };
  }
  return map;
}

export function isAutomationEnabled(
  map: AutomationSettingsMap | undefined,
  key: string,
): boolean {
  return !!map?.[key]?.enabled;
}

export function getAutomationParam<T = any>(
  map: AutomationSettingsMap | undefined,
  key: string,
  name: string,
  fallback: T,
): T {
  const v = map?.[key]?.params?.[name];
  return (v === undefined || v === null ? fallback : v) as T;
}
