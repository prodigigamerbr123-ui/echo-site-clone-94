import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { AIActionConfirmation } from "./AIActionConfirmation";
import {
  useAIConversation,
  type ConversationOptions,
} from "@/hooks/useAIConversation";

interface AIChatProps extends ConversationOptions {
  isExpanded: boolean;
}

export function AIChat({ isExpanded, ...options }: AIChatProps) {
  const {
    messages,
    inputMessage,
    setInputMessage,
    isLoading,
    loadingHistory,
    runningActionId,
    historyError,
    requestError,
    unsaved,
    blocked,
    sendMessage,
    confirmAction,
    rejectAction,
    retrySave,
    refreshHistory,
  } = useAIConversation(options);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("aiSuggestionAction");
      if (stored) {
        setInputMessage(stored);
        localStorage.removeItem("aiSuggestionAction");
      }
    } catch {
      /* Storage may be unavailable. */
    }
  }, [setInputMessage]);
  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    "Quantos alunos eu tenho cadastrados?",
    "Quais avaliações eu tenho amanhã?",
    "O WhatsApp está conectado?",
    "Quem faz aniversário hoje?",
  ];

  if (!isExpanded) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Assistente IA
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 p-3">
        <div className="space-y-4">
          {loadingHistory && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingHistory &&
            !historyError &&
            messages.length === 1 &&
            messages[0]?.id === "welcome" && (
              <div className="space-y-2 mb-4">
                <p className="text-sm text-muted-foreground">
                  Perguntas rápidas:
                </p>
                {quickActions.map((a) => (
                  <Button
                    key={a}
                    variant="outline"
                    size="sm"
                    className="w-full text-left justify-start h-auto p-2 text-xs whitespace-normal"
                    disabled={blocked}
                    onClick={() => setInputMessage(a)}
                  >
                    {a}
                  </Button>
                ))}
                <Separator className="my-3" />
              </div>
            )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[85%] space-y-2 ${m.role === "user" ? "items-end" : "items-start"} flex flex-col`}
              >
                {m.content && (
                  <Card
                    className={`p-3 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    )}
                  </Card>
                )}
                {m.pendingAction && (
                  <AIActionConfirmation
                    action={m.pendingAction}
                    onConfirm={() => void confirmAction(m.id)}
                    onReject={() => void rejectAction(m.id)}
                    isRunning={runningActionId === m.id}
                    state={m.actionState ?? "pending"}
                    disabled={blocked || !!historyError}
                  />
                )}
              </div>
              {m.role === "user" && (
                <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <Card className="bg-muted p-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <p className="text-sm">Pensando...</p>
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t space-y-2">
        {(historyError || requestError) && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm space-y-2"
          >
            <p>{historyError || requestError}</p>
            {unsaved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void retrySave()}
                disabled={isLoading}
              >
                {unsaved.message.role === "user"
                  ? "Salvar e enviar pergunta"
                  : "Salvar resposta"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshHistory()}
                disabled={blocked}
              >
                Atualizar histórico
              </Button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Pergunte qualquer coisa sobre o sistema..."
            className="text-sm"
            disabled={blocked || !!historyError}
            maxLength={4000}
            aria-label="Mensagem para o assistente"
          />
          <Button
            onClick={() => void sendMessage()}
            aria-label="Enviar mensagem ao assistente"
            disabled={!inputMessage.trim() || blocked || !!historyError}
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
