export interface Student { id: string; name: string; phone: string; had_evaluation: boolean; }
export interface PredefinedMessage { id: string; title: string; content: string; }

/** Toggle only visible recipients, retaining selections outside the current search. */
export function toggleVisibleRecipients(selected: string[], visible: string[]): string[] {
  const visibleIds = new Set(visible);
  if (visible.every((id) => selected.includes(id))) {
    return selected.filter((id) => !visibleIds.has(id));
  }
  return [...new Set([...selected, ...visible])];
}
