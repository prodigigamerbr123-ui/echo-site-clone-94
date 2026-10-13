import { describe, expect, it } from "vitest";
import { fetchAllPages } from "@/lib/fetchAllPages";

describe("consultas completas", () => {
  it("carrega 1.005 registros, inclusive nomes empatados, sem perder a última página", async () => {
    const source = Array.from({ length: 1005 }, (_, id) => ({ id, name: "Mesmo nome" }));
    const ranges: number[][] = [];
    const rows = await fetchAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null, count: source.length };
    });
    expect(rows).toEqual(source);
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("rejeita falha na segunda página em vez de entregar uma lista parcial", async () => {
    await expect(fetchAllPages(async (from) => from === 0
      ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null, count: 1005 }
      : { data: null, error: { message: "Falha de rede" }, count: null },
    )).rejects.toThrow("Falha de rede");
  });

  it("detecta limite da API menor que a página solicitada", async () => {
    await expect(fetchAllPages(async () => ({
      data: Array.from({ length: 100 }, (_, id) => ({ id })), error: null, count: 1005,
    }))).rejects.toThrow("dados incompletos");
  });

  it("aceita base vazia e não faz consulta extra ao terminar uma página cheia", async () => {
    expect(await fetchAllPages(async () => ({ data: [], error: null, count: 0 }))).toEqual([]);
    let calls = 0;
    const rows = await fetchAllPages(async () => {
      calls++;
      return { data: Array.from({ length: 500 }, (_, id) => id), error: null, count: 500 };
    });
    expect(rows).toHaveLength(500);
    expect(calls).toBe(1);
  });
});
