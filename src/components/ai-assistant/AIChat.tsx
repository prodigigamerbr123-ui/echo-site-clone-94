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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  isExpanded: boolean;
}

export function AIChat({ isExpanded }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Olá! 👋 Sou o assistente do **Academia Workout**. Posso consultar dados reais do sistema (alunos, mensagens, status do WhatsApp), explicar como usar cada aba e até executar ações por você. O que você precisa?',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('aiSuggestionAction');
    if (stored) {
      setInputMessage(stored);
      localStorage.removeItem('aiSuggestionAction');
    }
  }, []);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const el = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: inputMessage.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { messages: newHistory },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.message || '...' },
      ]);
    } catch (e: any) {
      console.error('chat error:', e);
      toast({
        title: 'Erro',
        description: e?.message || 'Não foi possível processar sua mensagem.',
        variant: 'destructive',
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    'Quantos alunos eu tenho cadastrados?',
    'Quais mensagens estão agendadas para hoje?',
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
          {messages.length === 1 && (
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
              <Card
                className={`max-w-[80%] p-3 ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                )}
              </Card>
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
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Pergunte qualquer coisa sobre o sistema..."
            className="text-sm"
            disabled={isLoading}
          />
          <Button onClick={sendMessage} disabled={!inputMessage.trim() || isLoading} size="sm">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
