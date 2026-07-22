// Espelho de src/lib/messageTemplates.ts para uso em edge functions.
// Resolve o texto final de uma mensagem automática se o usuário linkou uma
// mensagem pré-definida em automation_settings.params.templates[message_type].

export type TemplateVars = {
  nome?: string;
  data?: string;
  hora?: string;
  dias?: string;
  [key: string]: string | undefined;
};

export function interpolate(text: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    nome: vars.nome ?? "",
    name: vars.nome ?? "",
    aluno: vars.nome ?? "",
    data: vars.data ?? "",
    date: vars.data ?? "",
    hora: vars.hora ?? "",
    time: vars.hora ?? "",
    dias: vars.dias ?? "",
    days: vars.dias ?? "",
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    const key = String(k).toLowerCase();
    if (key in map) return map[key];
    const extra = vars[key];
    return extra !== undefined ? String(extra) : m;
  });
}

export function getLinkedTemplateId(
  settings: any,
  automationKey: string,
  messageType: string,
): string | null {
  const t = settings?.[automationKey]?.params?.templates;
  const id = t && typeof t === "object" ? t[messageType] : null;
  return id && typeof id === "string" ? id : null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const contentCache = new Map<string, { value: string | null; expiresAt: number }>();

export async function resolveAutomationMessage(
  supabase: any,
  settings: any,
  automationKey: string,
  messageType: string,
  fallback: string,
  vars: TemplateVars,
): Promise<string> {
  const id = getLinkedTemplateId(settings, automationKey, messageType);
  if (!id) return fallback;
  const now = Date.now();
  const cached = contentCache.get(id);
  let content: string | null;
  if (cached && cached.expiresAt > now) {
    content = cached.value;
  } else {
    const { data } = await supabase
      .from("predefined_messages")
      .select("content")
      .eq("id", id)
      .maybeSingle();
    content = data?.content ?? null;
    contentCache.set(id, { value: content, expiresAt: now + CACHE_TTL_MS });
  }
  if (!content) return fallback;
  return interpolate(content, vars);
}

