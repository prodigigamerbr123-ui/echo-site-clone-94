import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { AIActionConfirmation, type PendingAction } from './AIActionConfirmation';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  pendingAction?: PendingAction;
  actionState?: 'confirmed' | 'rejected';
}

interface AIChatProps {
  isExpanded: boolean;
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onConversationChanged?: () => void;
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    'Olá! 👋 Sou o assistente do **Academia Workout**. Posso consultar dados reais, agendar avaliações, enfileirar mensagens e explicar o sistema. Antes de qualquer ação que altere dados, vou te pedir confirmação. O que você precisa?',
};

export function AIChat({ isExpanded, conversationId, onConversationCreated, onConversationChanged }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [runningActionIdx, setRunningActionIdx] = useState<number | null>(null);
  const convIdRef = useRef<string | null>(conversationId ?? null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('aiSuggestionAction');
    if (stored) {
      setInputMessage(stored);
      localStorage.removeItem('aiSuggestionAction');
    }
  }, []);

  // Load history when conversationId changes
  useEffect(() => {
    convIdRef.current = conversationId ?? null;
    if (!conversationId) {
      setMessages([WELCOME]);
      return;
    }
    setLoadingHistory(true);
    (async () => {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error(error);
        setMessages([WELCOME]);
      } else if (!data || data.length === 0) {
        setMessages([WELCOME]);
      } else {
        setMessages(data.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      }
      setLoadingHistory(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    })();
  }, [conversationId]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const el = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const historyForApi = (msgs: ChatMessage[]) =>
    msgs.map((m) => ({ role: m.role, content: m.content }));

  const ensureConversation = async (firstUserText: string): Promise<string | null> => {
    if (convIdRef.current) return convIdRef.current;
    const title = firstUserText.slice(0, 60) || 'Nova conversa';
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ title })
      .select('id')
      .single();
    if (error || !data) {
      console.error('create conversation error', error);
      return null;
    }
    convIdRef.current = data.id;
    onConversationCreated?.(data.id);
    return data.id;
  };

  const persistMessage = async (convId: string, role: 'user' | 'assistant', content: string) => {
    await supabase.from('ai_messages').insert({ conversation_id: convId, role, content });
    await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    const text = inputMessage.trim();
    const userMsg: ChatMessage = { role: 'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);

    const convId = await ensureConversation(text);
    if (convId) await persistMessage(convId, 'user', text);

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { messages: historyForApi(newHistory) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const assistantText = data.message || '...';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantText, pendingAction: data.pendingAction },
      ]);
      if (convId) await persistMessage(convId, 'assistant', assistantText);
      onConversationChanged?.();
    } catch (e: any) {
      console.error('chat error:', e);
      toast({ title: 'Erro', description: e?.message || 'Falha ao processar.', variant: 'destructive' });
      const err = 'Desculpe, ocorreu um erro. Tente novamente.';
      setMessages((prev) => [...prev, { role: 'assistant', content: err }]);
      if (convId) await persistMessage(convId, 'assistant', err);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const confirmAction = async (idx: number) => {
    const msg = messages[idx];
    if (!msg?.pendingAction) return;
    setRunningActionIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          messages: historyForApi(messages.slice(0, idx + 1)),
          confirmedAction: { tool: msg.pendingAction.tool, args: msg.pendingAction.args },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const resultText = data.message || '✅ Feito.';
      setMessages((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], actionState: 'confirmed' };
        next.push({ role: 'assistant', content: resultText });
        return next;
      });
      if (convIdRef.current) await persistMessage(convIdRef.current, 'assistant', resultText);
      onConversationChanged?.();
    } catch (e: any) {
      toast({ title: 'Erro ao executar', description: e?.message, variant: 'destructive' });
    } finally {
      setRunningActionIdx(null);
    }
  };

  const rejectAction = (idx: number) => {
    const msgText = 'Sem problemas, ação cancelada. Me diga se quer ajustar algo.';
    setMessages((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], actionState: 'rejected' };
      next.push({ role: 'assistant', content: msgText });
      return next;
    });
    if (convIdRef.current) persistMessage(convIdRef.current, 'assistant', msgText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    'Quantos alunos eu tenho cadastrados?',
    'Quais avaliações eu tenho amanhã?',
    'O WhatsApp está conectado?',
    'Quem faz aniversário hoje?',
  ];

  if (!isExpanded) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground text-center">Assistente IA</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-3">
        <div className="space-y-4">
          {loadingHistory && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingHistory && messages.length === 1 && (
            <div className="space-y-2 mb-4">
              <p className="text-sm text-muted-foreground">Perguntas rápidas:</p>
              {quickActions.map((a) => (
                <Button
                  key={a}
                  variant="outline"
                  size="sm"
                  className="w-full text-left justify-start h-auto p-2 text-xs whitespace-normal"
                  onClick={() => setInputMessage(a)}
                >
                  {a}
                </Button>
              ))}
              <Separator className="my-3" />
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] space-y-2 ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {m.content && (
                  <Card className={`p-3 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {m.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
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
                    onConfirm={() => confirmAction(idx)}
                    onReject={() => rejectAction(idx)}
                    isRunning={runningActionIdx === idx}
                    done={m.actionState}
                  />
                )}
              </div>
              {m.role === 'user' && (
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

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Pergunte qualquer coisa sobre o sistema..."
            className="text-sm"
            disabled={isLoading}
            autoFocus
          />
          <Button onClick={sendMessage} disabled={!inputMessage.trim() || isLoading} size="sm">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
