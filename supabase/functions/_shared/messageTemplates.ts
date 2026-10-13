import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database, Json } from "./database.types.ts";

type SettingsMap = Record<string, { params: Record<string, Json | undefined> }>;
import { createTemplateReader, interpolate, type TemplateVars } from "./templateResolver.ts";
export { interpolate, type TemplateVars } from "./templateResolver.ts";

export function getLinkedTemplateId(
  settings: SettingsMap,
  automationKey: string,
  messageType: string,
): string | null {
  const t = settings?.[automationKey]?.params?.templates;
  const id = t && typeof t === "object" && !Array.isArray(t) ? t[messageType] : null;
  return id && typeof id === "string" ? id : null;
}

// Each handler creates a new authenticated/service client per request. Keying by
// that client avoids sharing template contents between requests or RLS identities.
const readers = new WeakMap<SupabaseClient<Database>, ReturnType<typeof createTemplateReader>>();

export async function resolveAutomationMessage(
  supabase: SupabaseClient<Database>, settings: SettingsMap,
  automationKey: string, messageType: string, fallback: string, vars: TemplateVars,
): Promise<string> {
  const id = getLinkedTemplateId(settings, automationKey, messageType);
  if (!id) return fallback;
  let read = readers.get(supabase);
  if (!read) {
    read = createTemplateReader(async (templateId) => {
      const { data, error } = await supabase.from("predefined_messages")
        .select("content").eq("id", templateId).maybeSingle();
      if (error) throw error;
      return data?.content ?? null;
    });
    readers.set(supabase, read);
  }
  const content = await read(id);
  return content ? interpolate(content, vars) : fallback;
}
