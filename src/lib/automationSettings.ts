import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type AutomationParams = Record<string, Json | undefined>;

export type AutomationSetting = {
  key: string;
  enabled: boolean;
  params: AutomationParams;
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
      params: row.params && typeof row.params === "object" && !Array.isArray(row.params) ? row.params : {},
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

export function getAutomationParam<T>(
  map: AutomationSettingsMap | undefined,
  key: string,
  name: string,
  fallback: T,
): T {
  const v = map?.[key]?.params?.[name];
  return (v === undefined || v === null ? fallback : v) as T;
}

export function automationTemplates(params: AutomationParams | undefined): Record<string, string> {
  const value = params?.templates;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string" && entry[1].length > 0));
}
