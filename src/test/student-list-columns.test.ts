import { DEFAULT_COLUMNS, parseVisibleColumns } from "@/components/alunos/listaAlunosColumns";
import { describe, expect, it } from "vitest";

describe("stored student column preferences", () => {
  it("keeps known boolean preferences and ignores extra or invalid values", () => {
    const columns = parseVisibleColumns('{"phone":false,"cpf":true,"city":"false","unknown":true}');
    expect(columns).toEqual({ ...DEFAULT_COLUMNS, phone: false, cpf: true });
  });

  it.each(["null", "[]", "false", "broken JSON"])("uses defaults for %s", (raw) => {
    expect(parseVisibleColumns(raw)).toEqual(DEFAULT_COLUMNS);
  });
});
