// Shared phone utilities used by every edge function that sends WhatsApp.
// Keep this file in sync — do NOT duplicate the logic elsewhere.

export interface FormatPhoneResult {
  ok: boolean;
  number: string;
  reason?: string;
}

/**
 * Normalize a Brazilian phone number to Evolution API format (E.164 without "+").
 * Ensures the country code 55 is present and validates the final digit count.
 *
 * Valid results have 12 digits (55 + 2 DDD + 8 legacy) or 13 digits (55 + 2 DDD + 9 mobile).
 */
export function formatPhone(rawPhone: string | null | undefined): FormatPhoneResult {
  if (!rawPhone) return { ok: false, number: "", reason: "Telefone vazio" };
  let p = String(rawPhone).replace(/\D/g, "");
  if (!p) return { ok: false, number: "", reason: "Telefone sem dígitos" };

  // Strip leading zeros that sometimes come from imports.
  p = p.replace(/^0+/, "");

  if (!p.startsWith("55")) p = "55" + p;

  if (p.length !== 12 && p.length !== 13) {
    return {
      ok: false,
      number: p,
      reason: `Número inválido (${p.length} dígitos após DDI 55; esperado 12 ou 13)`,
    };
  }

  return { ok: true, number: p };
}
