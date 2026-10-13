import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/errorMessage";
import { automationTemplates } from "@/lib/automationSettings";

describe("dados recebidos do backend", () => {
  it("preserva erros reais do banco e exceções JavaScript", () => {
    expect(errorMessage({ message: "Telefone duplicado", code: "23505" })).toBe("Telefone duplicado");
    expect(errorMessage(new Error("Sem conexão"))).toBe("Sem conexão");
  });

  it("aceita exceções sem formato de Error sem lançar outra exceção", () => {
    for (const error of [null, undefined, "network failure", 42, {}, { message: null }, { message: " " }]) {
      expect(errorMessage(error, "Tente novamente")).toBe("Tente novamente");
    }
  });

  it("ignora vínculos malformados e preserva os identificadores válidos", () => {
    expect(automationTemplates({ templates: { birthday: "id-modelo", invalid: false, another: null, empty: "" } }))
      .toEqual({ birthday: "id-modelo" });
    expect(automationTemplates({ templates: ["id-modelo"] })).toEqual({});
    expect(automationTemplates({ templates: null })).toEqual({});
  });
});
