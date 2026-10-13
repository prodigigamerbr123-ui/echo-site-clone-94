import { automationTemplates } from "@/lib/automationSettings";
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
  if (error) throw error;
  if (!data) return new Set();
  const ids = new Set<string>();
  for (const row of data) {
    const params = row.params && typeof row.params === "object" && !Array.isArray(row.params) ? row.params : {};
    for (const id of Object.values(automationTemplates(params))) ids.add(id);
  }
  return ids;
}
