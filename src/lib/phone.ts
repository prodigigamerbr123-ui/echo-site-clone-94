// Espelho front do supabase/functions/_shared/phone.ts.
// Mantenha os dois em sincronia.

export interface FormatPhoneResult {
  ok: boolean;
  number: string;
  formatted?: string;
  reason?: string;
}

export function formatPhoneBR(rawPhone: string | null | undefined): FormatPhoneResult {
  if (!rawPhone) return { ok: false, number: "", reason: "Telefone vazio" };
  let p = String(rawPhone).replace(/\D/g, "");
  if (!p) return { ok: false, number: "", reason: "Telefone sem dígitos" };
  p = p.replace(/^0+/, "");
  if (!p.startsWith("55")) p = "55" + p;
  if (p.length !== 12 && p.length !== 13) {
    return {
      ok: false,
      number: p,
      reason: `Precisa de 10 ou 11 dígitos (DDD + número). Você digitou ${p.length - 2}.`,
    };
  }
  const ddd = p.slice(2, 4);
  const rest = p.slice(4);
  const formatted =
    rest.length === 9
      ? `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
      : `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return { ok: true, number: p, formatted };
}

/** Substitui {nome} pelo nome do aluno (case-insensitive). */
export function replaceNameVar(content: string, name: string): string {
  return content.replace(/\{nome\}/gi, name);
}

export function hasNameVar(content: string): boolean {
  return /\{nome\}/i.test(content);
}
