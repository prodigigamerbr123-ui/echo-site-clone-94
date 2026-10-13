import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  appendChatMessage,
  loadConversationHistory,
} from "@/lib/aiConversations";
import { errorMessage } from "@/lib/errorMessage";
import {
  chatReply,
  recentChatContext,
  type ChatReply,
  type StoredChatMessage,
} from "../../supabase/functions/_shared/aiChatContracts";

const WELCOME: StoredChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Olá! 👋 Sou o assistente do **Academia Workout**. Posso consultar dados reais, agendar avaliações, enfileirar mensagens e explicar o sistema. Antes de qualquer ação que altere dados, vou te pedir confirmação. O que você precisa?",
};
export interface ConversationOptions {
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onConversationChanged?: () => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}
type Unsaved = { conversationId: string; message: StoredChatMessage };
function merge(messages: StoredChatMessage[], message: StoredChatMessage) {
  return messages.some((m) => m.id === message.id)
    ? messages.map((m) => (m.id === message.id ? message : m))
    : [...messages, message];
}

export function useAIConversation(options: ConversationOptions) {
  const {
    conversationId,
    onConversationCreated,
    onConversationChanged,
    onBusyChange,
    disabled,
  } = options;
  const [messages, setMessages] = useState<StoredChatMessage[]>([WELCOME]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(conversationId));
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<Unsaved | null>(null);
  const convIdRef = useRef<string | null>(null);
  const candidateRef = useRef<string | null>(null);
  const initialized = useRef(false);
  const version = useRef(0);
  const historyRequest = useRef(0);
  const busy = useRef(false);
  const isCurrent = (v: number) => version.current === v;

  const refreshHistory = useCallback(async () => {
    const id = convIdRef.current;
    if (!id) return;
    const v = version.current,
      request = ++historyRequest.current;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const rows = await loadConversationHistory(id);
      if (version.current === v && historyRequest.current === request) {
        setMessages(rows.length ? rows : [WELCOME]);
        setRequestError(null);
      }
    } catch (e) {
      if (version.current === v && historyRequest.current === request)
        setHistoryError(
          errorMessage(e, "Não foi possível carregar o histórico."),
        );
    } finally {
      if (version.current === v && historyRequest.current === request)
        setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    // Adoption of the newly created ID must not replace an in-flight first turn.
    if (initialized.current && convIdRef.current === (conversationId ?? null))
      return;
    initialized.current = true;
    version.current++;
    historyRequest.current++;
    busy.current = false;
    convIdRef.current = conversationId ?? null;
    candidateRef.current = null;
    setMessages([WELCOME]);
    setHistoryError(null);
    setRequestError(null);
    setUnsaved(null);
    setIsLoading(false);
    setRunningActionId(null);
    if (conversationId) void refreshHistory();
    else setLoadingHistory(false);
  }, [conversationId, refreshHistory]);
  useEffect(
    () => () => {
      version.current++;
      historyRequest.current++;
      initialized.current = false;
      busy.current = false;
    },
    [],
  );
  const blocked =
    isLoading || loadingHistory || runningActionId !== null || unsaved !== null;
  useEffect(() => {
    onBusyChange?.(blocked);
  }, [blocked, onBusyChange]);
  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  const ensureConversation = async (text: string, v: number) => {
    if (convIdRef.current) return convIdRef.current;
    const id = candidateRef.current ?? crypto.randomUUID();
    candidateRef.current = id;
    const inserted = await supabase
      .from("ai_conversations")
      .upsert(
        { id, title: text.slice(0, 60) || "Nova conversa" },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (inserted.error) throw inserted.error;
    if (!inserted.data) {
      const existing = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data)
        throw new Error("Não foi possível confirmar a criação da conversa.");
    }
    if (!isCurrent(v)) return null;
    convIdRef.current = id;
    onConversationCreated?.(id);
    return id;
  };
  const acceptReply = async (
    id: string,
    responseId: string,
    requestId: string,
    reply: ChatReply,
    v: number,
  ) => {
    if (!isCurrent(v)) return;
    const message: StoredChatMessage = {
      id: responseId,
      replyTo: requestId,
      role: "assistant",
      content: reply.message,
      pendingAction: reply.pendingAction,
      actionState: reply.pendingAction
        ? (reply.actionState ?? "pending")
        : undefined,
    };
    setMessages((prev) => merge(prev, message));
    if (reply.historySaved !== true) {
      try {
        await appendChatMessage(id, message);
      } catch {
        if (isCurrent(v)) {
          setUnsaved({ conversationId: id, message });
          setRequestError(
            "A resposta chegou, mas o salvamento não foi confirmado. Salve antes de sair desta conversa.",
          );
        }
        return;
      }
    }
    if (isCurrent(v)) onConversationChanged?.();
  };
  const sendMessage = async () => {
    if (
      disabled ||
      busy.current ||
      loadingHistory ||
      historyError ||
      runningActionId !== null ||
      (unsaved && unsaved.message.role !== "user")
    )
      return;
    const text = unsaved?.message.content ?? inputMessage.trim();
    if (!text || text.length > 4000) return;
    const userMessage = unsaved?.message ?? {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: text,
    };
    const responseId = crypto.randomUUID(),
      v = version.current;
    let userSaved = false,
      id: string | null = null;
    busy.current = true;
    setIsLoading(true);
    setRequestError(null);
    try {
      id = await ensureConversation(text, v);
      if (!id || !isCurrent(v)) return;
      await appendChatMessage(id, userMessage);
      userSaved = true;
      if (!isCurrent(v)) return;
      const context = merge(messages, userMessage);
      setMessages(context);
      setInputMessage("");
      setUnsaved(null);
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: recentChatContext(context),
          conversationId: id,
          responseMessageId: responseId,
          requestMessageId: userMessage.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      await acceptReply(id, responseId, userMessage.id, chatReply(data), v);
    } catch (e) {
      if (isCurrent(v)) {
        if (!userSaved && id)
          setUnsaved({ conversationId: id, message: userMessage });
        setRequestError(
          userSaved
            ? "Não foi possível receber a resposta. Sua pergunta foi salva. Atualize o histórico antes de fazer outra tentativa."
            : errorMessage(
                e,
                "Não foi possível salvar a pergunta. O texto foi preservado.",
              ),
        );
      }
    } finally {
      if (isCurrent(v)) {
        busy.current = false;
        setIsLoading(false);
      }
    }
  };
  const decideAction = async (messageId: string, reject: boolean) => {
    const original = messages.find((m) => m.id === messageId),
      id = convIdRef.current;
    if (
      disabled ||
      busy.current ||
      blocked ||
      historyError ||
      !id ||
      !original?.pendingAction ||
      original.actionState !== "pending"
    )
      return;
    const v = version.current,
      responseId = crypto.randomUUID();
    busy.current = true;
    setRunningActionId(messageId);
    setRequestError(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: recentChatContext(messages),
          conversationId: id,
          responseMessageId: responseId,
          requestMessageId: original.id,
          ...(reject
            ? { rejectedAction: { id: original.pendingAction.id } }
            : { confirmedAction: { id: original.pendingAction.id } }),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const reply = chatReply(data);
      if (!isCurrent(v)) return;
      // HTTP success alone cannot prove that a business operation was executed.
      if (reply.actionState)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, actionState: reply.actionState } : m,
          ),
        );
      await acceptReply(id, responseId, original.id, reply, v);
      if (!reply.actionState && isCurrent(v)) await refreshHistory();
    } catch {
      if (isCurrent(v)) {
        setRequestError(
          "Não foi possível confirmar o resultado. Confira o histórico antes de solicitar outra proposta.",
        );
        await refreshHistory(); // Read-only recovery; never automatically rerun an action.
      }
    } finally {
      if (isCurrent(v)) {
        busy.current = false;
        setRunningActionId(null);
      }
    }
  };
  const retrySave = async () => {
    if (!unsaved || busy.current) return;
    if (unsaved.message.role === "user") return sendMessage();
    const v = version.current;
    busy.current = true;
    setIsLoading(true);
    try {
      await appendChatMessage(unsaved.conversationId, unsaved.message);
      if (isCurrent(v)) {
        setUnsaved(null);
        setRequestError(null);
        onConversationChanged?.();
        await refreshHistory();
      }
    } catch {
      if (isCurrent(v))
        setRequestError(
          "O salvamento ainda não foi confirmado. A resposta permanece nesta tela.",
        );
    } finally {
      if (isCurrent(v)) {
        busy.current = false;
        setIsLoading(false);
      }
    }
  };
  return {
    messages,
    inputMessage,
    setInputMessage,
    isLoading,
    loadingHistory,
    runningActionId,
    historyError,
    requestError,
    unsaved,
    blocked: blocked || !!disabled,
    sendMessage,
    confirmAction: (id: string) => decideAction(id, false),
    rejectAction: (id: string) => decideAction(id, true),
    retrySave,
    refreshHistory,
  };
}
