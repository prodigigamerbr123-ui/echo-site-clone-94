import { isRecord, record } from "./contracts.ts";

export class ToolValidationError extends Error {}
type RangeArgs = { status?: string; from?: string; to?: string; limit?: number };
export type ToolAction =
  | { tool: "list_students"; args: { search?: string; limit?: number } }
  | { tool: "get_dashboard_stats" | "list_predefined_messages" | "get_whatsapp_status"; args: Record<string, never> }
  | { tool: "list_scheduled_messages" | "list_evaluations"; args: RangeArgs }
  | { tool: "list_sent_messages"; args: { student_name?: string; limit?: number } }
  | { tool: "schedule_evaluation"; args: { student_id: string; scheduled_at: string; notes?: string } }
  | { tool: "complete_evaluation"; args: { evaluation_id: string; outcome: "completed" | "no_show" } }
  | { tool: "create_student"; args: { name: string; phone: string; birth_date?: string; had_evaluation?: boolean } }
  | { tool: "schedule_message"; args: { student_ids: string[]; content: string; scheduled_for?: string; message_type: "manual" } }
  | { tool: "delete_scheduled_message"; args: { id: string } }
  | { tool: "create_predefined_message"; args: { title: string; content: string } };

export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ToolValidationError("Identificador inválido.");
  }
  return value;
}

function text(value: unknown, field: string, max: number, optional = false): string | undefined {
  if (optional && (value === undefined || value === null)) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new ToolValidationError("Campo inválido: " + field + ".");
  }
  return value;
}
function requiredText(value: unknown, field: string, max: number): string {
  return text(value, field, max)!;
}
function date(value: unknown, field: string, optional = false): string | undefined {
  const result = text(value, field, 64, optional);
  if (result === undefined) return undefined;
  const day = result.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}/.test(result) || !Number.isFinite(Date.parse(result)) ||
      new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) {
    throw new ToolValidationError("Data inválida: " + field + ".");
  }
  return result;
}
function limit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 500) {
    throw new ToolValidationError("Limite de consulta deve estar entre 1 e 500.");
  }
  return value;
}

/** Validate model output and stored arguments before any database operation. */
export function parseToolAction(name: string, value: unknown): ToolAction {
  if (!isRecord(value)) throw new ToolValidationError("Argumentos da ação devem ser um objeto.");
  const args = value;
  switch (name) {
    case "list_students": return { tool: name, args: { search: text(args.search, "search", 200, true), limit: limit(args.limit) } };
    case "get_dashboard_stats": case "list_predefined_messages": case "get_whatsapp_status":
      return { tool: name, args: {} };
    case "list_sent_messages":
      return { tool: name, args: { student_name: text(args.student_name, "student_name", 200, true), limit: limit(args.limit) } };
    case "list_scheduled_messages": case "list_evaluations": {
      const status = text(args.status, "status", 30, true);
      const allowed = name === "list_evaluations" ? ["scheduled", "completed", "no_show", "cancelled", "all"]
        : ["pending", "processing", "sent", "failed", "cancelled", "all"];
      if (status && !allowed.includes(status)) throw new ToolValidationError("Status inválido.");
      const from = date(args.from, "from", true), to = date(args.to, "to", true);
      if (from && to && Date.parse(from) > Date.parse(to)) throw new ToolValidationError("Período inválido.");
      return { tool: name, args: { status, from, to, limit: limit(args.limit) } };
    }
    case "schedule_evaluation":
      return { tool: name, args: { student_id: uuid(args.student_id), scheduled_at: date(args.scheduled_at, "scheduled_at")!,
        notes: text(args.notes, "notes", 4000, true) } };
    case "complete_evaluation": {
      if (args.outcome !== "completed" && args.outcome !== "no_show") throw new ToolValidationError("Resultado de avaliação inválido.");
      return { tool: name, args: { evaluation_id: uuid(args.evaluation_id), outcome: args.outcome } };
    }
    case "create_student": {
      const birth = date(args.birth_date, "birth_date", true);
      if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw new ToolValidationError("Nascimento deve ser YYYY-MM-DD.");
      if (args.had_evaluation !== undefined && typeof args.had_evaluation !== "boolean") throw new ToolValidationError("Avaliação anterior inválida.");
      return { tool: name, args: { name: requiredText(args.name, "name", 200), phone: requiredText(args.phone, "phone", 40),
        birth_date: birth, had_evaluation: typeof args.had_evaluation === "boolean" ? args.had_evaluation : undefined } };
    }
    case "schedule_message": {
      if (!Array.isArray(args.student_ids) || !args.student_ids.length || args.student_ids.length > 200) {
        throw new ToolValidationError("Selecione entre 1 e 200 alunos por proposta.");
      }
      const ids = args.student_ids.map(uuid);
      if (new Set(ids).size !== ids.length) throw new ToolValidationError("Há alunos repetidos na proposta.");
      if (args.message_type !== undefined && args.message_type !== "manual") throw new ToolValidationError("Use a agenda para mensagens automáticas.");
      return { tool: name, args: { student_ids: ids, content: requiredText(args.content, "content", 1000),
        scheduled_for: date(args.scheduled_for, "scheduled_for", true), message_type: "manual" } };
    }
    case "delete_scheduled_message": return { tool: name, args: { id: uuid(args.id) } };
    case "create_predefined_message": return { tool: name, args: { title: requiredText(args.title, "title", 200), content: requiredText(args.content, "content", 4000) } };
    default: throw new ToolValidationError("Ferramenta não reconhecida.");
  }
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export function clientHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length > 40) throw new ToolValidationError("Histórico de conversa inválido.");
  return value.map(item => {
    const message = record(item);
    if ((message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" || message.content.length > 12000) {
      throw new ToolValidationError("Histórico de conversa inválido.");
    }
    return { role: message.role, content: message.content };
  });
}

export function modelMessage(value: unknown): ChatMessage | null {
  const choices = record(value).choices;
  const message = record(Array.isArray(choices) ? record(choices[0]).message : null);
  if (!Object.keys(message).length) return null;
  const calls = message.tool_calls;
  if (calls !== undefined && !Array.isArray(calls)) throw new ToolValidationError("Resposta de ferramentas inválida.");
  const tool_calls: ToolCall[] = (Array.isArray(calls) ? calls : []).map(call => {
    const item = record(call), fn = record(item.function);
    if (typeof item.id !== "string" || typeof fn.name !== "string" ||
        (fn.arguments !== undefined && typeof fn.arguments !== "string")) {
      throw new ToolValidationError("Resposta de ferramentas inválida.");
    }
    return { id: item.id, type: "function", function: { name: fn.name, arguments: typeof fn.arguments === "string" ? fn.arguments : "{}" } };
  });
  if (message.content !== undefined && message.content !== null && typeof message.content !== "string") {
    throw new ToolValidationError("Resposta de texto inválida.");
  }
  return { role: "assistant", content: typeof message.content === "string" ? message.content : null, tool_calls };
}
