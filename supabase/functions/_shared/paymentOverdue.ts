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
// Falhas e cancelamentos não contam, pois não chegaram ao aluno.
export const COUNTED_OVERDUE_STATUSES = ["pending", "processing", "sent", "uncertain"];

export function countOverdueAttempts(rows: { student_id: string; source_payment_due_date: string | null }[]): Map<string, number> {
  const attempts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.student_id}:${row.source_payment_due_date ?? ""}`;
    attempts.set(key, (attempts.get(key) ?? 0) + 1);
  }
  return attempts;
}

export function overdueAttemptsExhausted(attempts: Map<string, number>, studentId: string, due: string, maxAttempts: number): boolean {
  return (attempts.get(`${studentId}:${due}`) ?? 0) >= maxAttempts;
}
