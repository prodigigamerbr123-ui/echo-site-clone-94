interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}

/** Callers must request count: exact and order by a unique tie breaker. */
export async function fetchAllPages<T>(
  query: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await query(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (count === null) throw new Error("Não foi possível confirmar a quantidade de registros.");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < Math.min(pageSize, Math.max(0, count - from))) {
      throw new Error("A consulta retornou dados incompletos. Tente carregar novamente.");
    }
    if (from + page.length >= count) return rows;
  }
}
