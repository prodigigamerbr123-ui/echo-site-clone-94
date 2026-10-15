import { describe, expect, it } from "vitest";
import { evaluationDaysOverdue, needsEvaluation } from "@/lib/evaluationDue";

const now = Date.parse("2026-10-13T03:00:00Z");
const student = { status: "active", had_evaluation: true,
  last_evaluation_date: new Date(now - 31 * 86400000).toISOString(), created_at: "2025-01-01T00:00:00Z" };

describe("prazo da agenda em paridade com a automação", () => {
  it("usa valor configurado, incluindo zero, e 90 somente quando ausente", () => {
    expect(evaluationDaysOverdue(undefined)).toBe(90);
    expect(evaluationDaysOverdue("30")).toBe(30);
    expect(evaluationDaysOverdue(0)).toBe(0);
    expect(needsEvaluation(student, 30, false, now)).toBe(true);
    expect(needsEvaluation(student, 90, false, now)).toBe(false);
  });
  it("recusa configuração inválida em vez de mostrar zero alunos", () => {
    for (const value of [null, false, {}, [], "", "abc", -1, Infinity, NaN]) {
      expect(() => evaluationDaysOverdue(value)).toThrow();
    }
  });
  it("mantém limiar estrito de tempo decorrido independentemente do fuso", () => {
    const atBoundary = { ...student, last_evaluation_date: new Date(now - 30 * 86400000).toISOString() };
    expect(needsEvaluation(atBoundary, 30, false, now)).toBe(false);
    expect(needsEvaluation(atBoundary, 30, false, now + 1)).toBe(true);
  });
  it("primeira avaliação usa carência de 14 dias, independente do prazo de reavaliação", () => {
    const first = { ...student, had_evaluation: false, last_evaluation_date: null,
      created_at: new Date(now - 14 * 86400000).toISOString() };
    expect(needsEvaluation(first, 0, false, now)).toBe(false);
    expect(needsEvaluation(first, 90, false, now + 1)).toBe(true);
    expect(needsEvaluation({ ...first, had_evaluation: true }, 0, false, now + 1)).toBe(false);
  });
  it("exclui inativos e alunos com avaliação futura", () => {
    expect(needsEvaluation({ ...student, status: "inactive" }, 0, false, now)).toBe(false);
    expect(needsEvaluation(student, 0, true, now)).toBe(false);
  });
  it("aceita o indicador nulo do banco como ausência de avaliação registrada", () => {
    const first = { ...student, had_evaluation: null, last_evaluation_date: null,
      created_at: new Date(now - 15 * 86400000).toISOString() };
    expect(needsEvaluation(first, 90, false, now)).toBe(true);
    expect(needsEvaluation({ ...first, status: "inactive" }, 90, false, now)).toBe(false);
    expect(needsEvaluation(first, 90, true, now)).toBe(false);
  });
});
