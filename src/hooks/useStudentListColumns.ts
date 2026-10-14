import { DEFAULT_COLUMNS, parseVisibleColumns, type ColumnKey } from "@/components/alunos/listaAlunosColumns";
import { useEffect, useState } from "react";

const COLUMNS_STORAGE_KEY = "alunos:visibleColumns:v3";

export function useStudentListColumns() {
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (!raw) return DEFAULT_COLUMNS;
      return parseVisibleColumns(raw);
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch { /* ignore */ }
  }, [visibleColumns]);
  const toggleColumn = (k: ColumnKey) =>
    setVisibleColumns((prev) => ({ ...prev, [k]: !prev[k] }));
  const visibleCount = Object.values(visibleColumns).filter(Boolean).length;

  return { visibleColumns, setVisibleColumns, toggleColumn, visibleCount };
}
