import type { Json } from "./database.types.ts";

interface HistoryQuery extends PromiseLike<{ data: Json[] | null; error: unknown; count: number | null }> {
  order(column: string, options: { ascending: boolean }): HistoryQuery;
  ilike(column: string, pattern: string): HistoryQuery;
  limit(count: number): HistoryQuery;
}
interface HistoryClient {
  from(table: "messages"): { select(columns: string, options: { count: "exact" }): HistoryQuery };
}

/** Filter in PostgreSQL before limiting, preserving the caller's RLS. */
export async function getAssistantMessageHistory(
  supabase: HistoryClient,
  args: { student_name?: string; limit?: number },
) {
  const limit = args.limit ?? 30;
  const search = args.student_name;
  const select = search
    ? "id, content, sent_at, status, students!inner(name, phone)"
    : "id, content, sent_at, status, students(name, phone)";
  let query = supabase.from("messages").select(select, { count: "exact" })
    .order("sent_at", { ascending: false }).order("id", { ascending: false });
  // Escape pattern characters so a name containing % or _ remains literal.
  if (search) query = query.ilike("students.name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error, count } = await query.limit(limit);
  if (error) throw error;
  const messages = data ?? [];
  return { count: messages.length, totalCount: count, limit,
    truncated: count === null ? null : count > messages.length,
    messages, criteria: "Histórico de tentativas: confira o status; envio aceito não confirma entrega ou leitura." };
}
