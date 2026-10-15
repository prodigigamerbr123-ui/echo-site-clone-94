import type { Tables } from "@/integrations/supabase/types";

export type Student = Pick<Tables<"students">, "id" | "name" | "phone" | "had_evaluation">;
export interface PredefinedMessage { id: string; title: string; content: string; }

/** Toggle only visible recipients, retaining selections outside the current search. */
export function toggleVisibleRecipients(selected: string[], visible: string[]): string[] {
  const visibleIds = new Set(visible);
  if (visible.every((id) => selected.includes(id))) {
    return selected.filter((id) => !visibleIds.has(id));
  }
  return [...new Set([...selected, ...visible])];
}
