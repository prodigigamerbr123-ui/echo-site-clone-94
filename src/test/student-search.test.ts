import { describe, expect, it } from "vitest";
import { matchesStudentSearch } from "@/lib/studentSearch";

const student = { name: "João da Silva", phone: "+55 (55) 99999-4321", cpf: "123.456.789-09" };

describe("busca de alunos", () => {
  it("não retorna todos para texto inexistente", () => {
    expect(matchesStudentSearch(student, "nome inexistente")).toBe(false);
  });

  it("ignora diferenças de acentuação, caixa e espaços", () => {
    expect(matchesStudentSearch(student, "  joao ")).toBe(true);
    expect(matchesStudentSearch(student, "SILVA")).toBe(true);
  });

  it("encontra telefone sem depender da máscara", () => {
    expect(matchesStudentSearch(student, "(55) 99999")).toBe(true);
    expect(matchesStudentSearch(student, "99999-4321")).toBe(true);
  });

  it("encontra CPF parcial com ou sem pontuação", () => {
    expect(matchesStudentSearch(student, "456.789")).toBe(true);
    expect(matchesStudentSearch(student, "123456")).toBe(true);
  });

  it("não transforma buscas com letras e dígitos em busca por CPF", () => {
    expect(matchesStudentSearch(student, "abc123")).toBe(false);
  });

  it("aceita busca vazia mesmo sem CPF", () => {
    expect(matchesStudentSearch({ ...student, cpf: null }, " ")).toBe(true);
    expect(matchesStudentSearch({ ...student, cpf: null }, "inexistente")).toBe(false);
  });
  it("normaliza espaços internos e o DDI sem confundir o DDD 55", () => {
    expect(matchesStudentSearch(student, "joao   da   silva")).toBe(true);
    expect(matchesStudentSearch({ name: "Teste", phone: "55999994321" }, "+55 (55) 99999-4321")).toBe(true);
    expect(matchesStudentSearch({ name: "Teste", phone: "+55 (55) 99999-4321" }, "(55) 99999-4321")).toBe(true);
  });
  it("handles absent student relations without matching unrelated terms", () => {
    expect(matchesStudentSearch(null, "João")).toBe(false);
    expect(matchesStudentSearch(undefined, "999")).toBe(false);
    expect(matchesStudentSearch(null, "  ")).toBe(true);
    expect(matchesStudentSearch(student, "()--")).toBe(false);
  });
});
