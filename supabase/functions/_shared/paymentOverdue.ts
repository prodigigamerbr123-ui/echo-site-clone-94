// Regras da cobrança de mensalidade vencida, sem dependências de runtime para
// serem testadas no Vitest e usadas pela automação diária.

// Acima disso a data cadastrada pode estar desatualizada; não afirmar um número exato de dias.
export const OVERDUE_DAYS_SHOWN = 30;

export function overdueDaysLabel(days: number): string {
  return days > OVERDUE_DAYS_SHOWN ? `mais de ${OVERDUE_DAYS_SHOWN} dias` : `${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Valor de {dias} em modelos que já escrevem "dias" depois do marcador. */
export function overdueDaysPlaceholder(days: number): string {
  return days > OVERDUE_DAYS_SHOWN ? `mais de ${OVERDUE_DAYS_SHOWN}` : String(days);
}

// Tentativas contam por vencimento: atualizar a data do aluno recomeça a contagem.
// Falhas com despacho iniciado podem ter chegado e também consomem o limite.
export const COUNTED_OVERDUE_STATUSES = ["pending", "processing", "sent", "uncertain", "failed"];

type OverdueAttempt = {
  student_id: string;
  source_payment_due_date: string | null;
  status: string;
  dispatch_started_at: string | null;
};

export function countOverdueAttempts(rows: OverdueAttempt[]): Map<string, number> {
  const attempts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "failed" ? !row.dispatch_started_at : !COUNTED_OVERDUE_STATUSES.includes(row.status)) continue;
    const key = `${row.student_id}:${row.source_payment_due_date ?? ""}`;
    attempts.set(key, (attempts.get(key) ?? 0) + 1);
  }
  return attempts;
}

export const OVERDUE_PARAM_DEFAULTS = { days_after_due: 1, repeat_every_days: 7, max_attempts: 3 };
const OVERDUE_PARAM_LABELS = {
  days_after_due: "Enviar a partir de",
  repeat_every_days: "Repetir a cada",
  max_attempts: "Máximo de cobranças por vencimento",
};

/** Missing legacy fields use defaults; malformed saved settings stop scheduling. */
export function readOverdueParams(params: Record<string, unknown>) {
  const result = { ...OVERDUE_PARAM_DEFAULTS };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    const raw = params[key] === undefined ? result[key] : params[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${OVERDUE_PARAM_LABELS[key]}: informe um número inteiro maior ou igual a 1.`);
    }
    result[key] = value;
  }
  return result;
}

export function overdueAttemptsExhausted(attempts: Map<string, number>, studentId: string, due: string, maxAttempts: number): boolean {
  return (attempts.get(`${studentId}:${due}`) ?? 0) >= maxAttempts;
}
