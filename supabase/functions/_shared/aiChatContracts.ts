import { isRecord } from "./contracts.ts";

export type ActionState =
  | "pending"
  | "executing"
  | "completed"
  | "failed"
  | "rejected"
  | "expired"
  | "blocked";
export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
}
export interface StoredChatMessage {
  id: string;
  replyTo?: string;
  role: "user" | "assistant";
  content: string;
  pendingAction?: PendingAction;
  actionState?: ActionState;
}
export interface ChatReply {
  message: string;
  pendingAction?: PendingAction;
  actionState?: ActionState;
  historySaved?: boolean;
}
export function chatUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function state(value: unknown): ActionState | undefined {
  if (value == null) return undefined;
  if (
    typeof value !== "string" ||
    ![
      "pending",
      "executing",
      "completed",
      "failed",
      "rejected",
      "expired",
      "blocked",
    ].includes(value)
  )
    throw new Error("Estado de ação inválido. Atualize o histórico.");
  return value as ActionState;
}
function proposal(value: unknown): PendingAction | undefined {
  if (value == null) return undefined;
  if (
    !isRecord(value) ||
    !chatUuid(value.id) ||
    typeof value.tool !== "string" ||
    !isRecord(value.args) ||
    typeof value.description !== "string"
  )
    throw new Error("Proposta inválida. Atualize o histórico.");
  return {
    id: value.id,
    tool: value.tool,
    args: value.args,
    description: value.description,
  };
}
export function chatReply(value: unknown): ChatReply {
  if (
    !isRecord(value) ||
    typeof value.message !== "string" ||
    !value.message.trim() ||
    value.message.length > 12000 ||
    (value.historySaved !== undefined &&
      typeof value.historySaved !== "boolean")
  )
    throw new Error("Resposta inválida do assistente. Atualize o histórico.");
  const pendingAction = proposal(value.pendingAction),
    actionState = state(value.actionState);
  if (pendingAction && !actionState)
    throw new Error("Estado da proposta indisponível. Atualize o histórico.");
  return {
    message: value.message,
    pendingAction,
    actionState,
    historySaved:
      typeof value.historySaved === "boolean" ? value.historySaved : undefined,
  };
}
export function chatHistory(value: unknown): StoredChatMessage[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.messages))
    throw new Error("Histórico indisponível. Tente novamente.");
  const ids = new Set<string>();
  return value.messages.map((m) => {
    if (
      !isRecord(m) ||
      !chatUuid(m.id) ||
      ids.has(m.id) ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string"
    )
      throw new Error("Histórico inválido. Tente carregar novamente.");
    ids.add(m.id);
    if (m.replyTo != null && !chatUuid(m.replyTo))
      throw new Error("Vínculo da resposta inválido.");
    const pendingAction = proposal(m.pendingAction),
      actionState = state(m.actionState);
    if (pendingAction && !actionState)
      throw new Error("Estado da proposta indisponível.");
    return {
      id: m.id,
      replyTo: typeof m.replyTo === "string" ? m.replyTo : undefined,
      role: m.role,
      content: m.content,
      pendingAction,
      actionState,
    };
  });
}
/** Complete history stays visible; only the latest 40 messages are sent to the model. */
export function recentChatContext(
  messages: Pick<StoredChatMessage, "role" | "content">[],
) {
  return messages
    .slice(-40)
    .map(({ role, content }) => ({ role, content: content.slice(0, 12000) }));
}
