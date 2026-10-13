import { describe, expect, it } from "vitest";
import { formatPhoneBR } from "@/lib/phone";
import { formatPhone as formatPhoneServer } from "../../supabase/functions/_shared/phone";

describe("normalização de telefone brasileiro no navegador e no servidor", () => {
  const examples: Array<[string, string]> = [
    ["(55) 99999-4321", "5555999994321"],
    ["(55) 3333-4321", "555533334321"],
    ["+55 (55) 99999-4321", "5555999994321"],
    ["+55 (11) 98888-1234", "5511988881234"],
    ["11988881234", "5511988881234"],
    ["005511988881234", "5511988881234"],
  ];

  it.each(examples)("normaliza %s para %s em ambos os lados", (input, number) => {
    expect(formatPhoneBR(input)).toMatchObject({ ok: true, number });
    expect(formatPhoneServer(input)).toMatchObject({ ok: true, number });
  });

  it("rejeita números incompletos sem alterar as regras de validação", () => {
    expect(formatPhoneBR("55999").ok).toBe(false);
    expect(formatPhoneServer("55999").ok).toBe(false);
  });
});
