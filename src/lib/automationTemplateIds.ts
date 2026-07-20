import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the set of predefined_messages IDs that are linked to any automation
 * (via automation_settings.params.templates). These messages should NOT appear
 * as options in manual send / schedule flows.
 */
export async function fetchAutomationTemplateIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("automation_settings")
    .select("params");
  if (error || !data) return new Set();
  const ids = new Set<string>();
  for (const row of data as Array<{ params: any }>) {
    const tpl = row?.params?.templates;
    if (tpl && typeof tpl === "object") {
      for (const v of Object.values(tpl)) {
        if (typeof v === "string" && v) ids.add(v);
      }
    }
  }
  return ids;
}
