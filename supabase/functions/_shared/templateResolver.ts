/** Pure helpers shared by the browser and Edge Functions. */
export type TemplateVars = { nome?: string; data?: string; hora?: string; dias?: string; [key: string]: string | undefined };

export function interpolate(text: string, vars: TemplateVars): string {
  const aliases: Record<string, string> = {
    nome: vars.nome ?? "", name: vars.nome ?? "", aluno: vars.nome ?? "",
    data: vars.data ?? "", date: vars.data ?? "", hora: vars.hora ?? "", time: vars.hora ?? "",
    dias: vars.dias ?? "", days: vars.dias ?? "",
  };
  return text.replace(/\{(\w+)\}/g, (original, key: string) => {
    const normalized = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(aliases, normalized)) return aliases[normalized];
    const extra = Object.prototype.hasOwnProperty.call(vars, normalized) ? vars[normalized] : undefined;
    return typeof extra === "string" ? extra : original;
  });
}

/** Create once per scheduling request. Never share this cache across requests or identities. */
export function createTemplateReader(load: (id: string) => Promise<string | null>) {
  const cache = new Map<string, string | null>();
  return async (id: string): Promise<string | null> => {
    if (cache.has(id)) return cache.get(id)!;
    // Failed reads must not become cached "missing template" results.
    const content = await load(id);
    cache.set(id, content);
    return content;
  };
}
