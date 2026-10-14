export type ColumnKey =
  | "phone"
  | "cpf"
  | "city"
  | "birthday"
  | "plan"
  | "created"
  | "dueDate"
  | "payment"
  | "lastEval"
  | "status";

export const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: "phone", label: "WhatsApp" },
  { key: "cpf", label: "CPF" },
  { key: "city", label: "Cidade" },
  { key: "birthday", label: "Aniversário" },
  { key: "plan", label: "Plano" },
  { key: "created", label: "Cadastrado em" },
  { key: "dueDate", label: "Vencimento" },
  { key: "payment", label: "Pagamento" },
  { key: "lastEval", label: "Última avaliação" },
  { key: "status", label: "Status" },
];

export const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  phone: true,
  cpf: false,
  city: true,
  birthday: true,
  plan: true,
  created: true,
  dueDate: true,
  payment: true,
  lastEval: true,
  status: true,
};

/** Accept only known boolean preferences; ignore stale or malformed storage. */
export function parseVisibleColumns(raw: string): Record<ColumnKey, boolean> {
  const columns = { ...DEFAULT_COLUMNS };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return columns;
    const preferences = value as Record<string, unknown>;
    for (const { key } of COLUMN_DEFS) {
      const stored = preferences[key];
      if (typeof stored === "boolean") {
        columns[key] = stored;
      }
    }
  } catch {
    // Corrupt browser storage should not prevent the student screen from loading.
  }
  return columns;
}
