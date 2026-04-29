import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Send, Bot, User, Loader2, Sparkles, Zap } from 'lucide-react';
import { AIActionConfirmation } from './AIActionConfirmation';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  actionRequest?: {
    type: string;
    description: string;
    params: any;
  };
  actionResult?: {
    success: boolean;
    message: string;
    data?: any;
  };
}

interface AIChatProps {
  isExpanded: boolean;
}

export function AIChat({ isExpanded }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Olá! 👋 Sou seu assistente inteligente para gestão da academia. Além de responder perguntas, posso executar ações no sistema quando você autorizar, como cadastrar alunos, agendar mensagens e muito mais!',
      isUser: false,
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Check for stored suggestion action on mount
  useEffect(() => {
    const storedAction = localStorage.getItem('aiSuggestionAction');
    if (storedAction) {
      setInputMessage(storedAction);
      localStorage.removeItem('aiSuggestionAction');
    }
  }, []);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const executeAction = async (action: any, userConfirmation: boolean = false) => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-database-actions', {
        body: {
          action: action.type,
          params: action.params,
          userConfirmation
        }
      });

      if (error) throw error;

      if (data.requiresConfirmation && !userConfirmation) {
        setPendingAction({
          type: action.type,
          description: data.actionDescription,
          params: action.params
        });
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error executing action:', error);
      throw error;
    }
  };

  const handleActionConfirm = async () => {
    if (!pendingAction) return;

    try {
      setIsLoading(true);
      const result = await executeAction(pendingAction, true);
      
      const resultMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `✅ ${result.message}`,
        isUser: false,
        timestamp: new Date(),
        actionResult: result
      };

      setMessages(prev => [...prev, resultMessage]);
      setPendingAction(null);

      toast({
        title: "Ação executada",
        description: result.message,
      });

    } catch (error) {
      console.error('Error confirming action:', error);
      toast({
        title: "Erro",
        description: "Não foi possível executar a ação.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionReject = () => {
    setPendingAction(null);
    
    const rejectionMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: '❌ Ação cancelada pelo usuário.',
      isUser: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, rejectionMessage]);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Get some context data if available
      let context = {};
      try {
        const { data: studentsData } = await supabase
          .from('students')
          .select('*')
          .limit(100);
        
        const { data: messagesData } = await supabase
          .from('scheduled_messages')
          .select('*')
          .eq('status', 'pending')
          .limit(50);

        context = {
          totalStudents: studentsData?.length || 0,
          pendingMessages: messagesData?.length || 0,
          students: studentsData?.slice(0, 10) || [], // Limit context size
          recentMessages: messagesData?.slice(0, 5) || []
        };
      } catch (error) {
        console.log('Could not fetch context data:', error);
      }

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          message: `${inputMessage}

INSTRUÇÕES ESPECIAIS PARA IA:
Você pode sugerir e executar ações no sistema. Para isso, quando apropriado, inclua no final da sua resposta uma seção especial formatada assim:

[AÇÃO_SUGERIDA]
Tipo: create_student | schedule_message | update_student_evaluation | create_predefined_message | get_students_needing_followup | send_whatsapp_message
Descrição: Breve descrição da ação
Parâmetros: {objeto JSON com os parâmetros necessários}
[/AÇÃO_SUGERIDA]

Exemplos:
1. Para cadastrar aluno:
[AÇÃO_SUGERIDA]
Tipo: create_student
Descrição: Cadastrar novo aluno João Silva
Parâmetros: {"name": "João Silva", "phone": "(11) 99999-9999", "birth_date": "1990-01-01"}
[/AÇÃO_SUGERIDA]

2. Para enviar mensagem via WhatsApp:
[AÇÃO_SUGERIDA]
Tipo: send_whatsapp_message
Descrição: Enviar mensagem motivacional para alunos
Parâmetros: {"student_ids": ["uuid1", "uuid2"], "message": "Olá! Como estão os treinos?"}
[/AÇÃO_SUGERIDA]

Ou usando dados completos dos alunos:
[AÇÃO_SUGERIDA]
Tipo: send_whatsapp_message
Descrição: Enviar mensagem para João Silva
Parâmetros: {"students": [{"id": "uuid", "name": "João Silva", "phone": "(11) 99999-9999"}], "message": "Oi João! Como foi o treino hoje?"}
[/AÇÃO_SUGERIDA]

Use isso apenas quando for realmente apropriado e útil para o usuário.`,
          context
        }
      });

      if (error) throw error;

      let messageContent = data.message;
      let actionRequest = null;

      // Check if the response contains an action suggestion
      const actionMatch = messageContent.match(/\[AÇÃO_SUGERIDA\](.*?)\[\/AÇÃO_SUGERIDA\]/s);
      if (actionMatch) {
        const actionText = actionMatch[1].trim();
        const typeMatch = actionText.match(/Tipo:\s*(.+)/);
        const descMatch = actionText.match(/Descrição:\s*(.+)/);
        const paramsMatch = actionText.match(/Parâmetros:\s*(\{.*\})/s);

        if (typeMatch && descMatch && paramsMatch) {
          try {
            actionRequest = {
              type: typeMatch[1].trim(),
              description: descMatch[1].trim(),
              params: JSON.parse(paramsMatch[1].trim())
            };
            
            // Remove the action block from the message content
            messageContent = messageContent.replace(actionMatch[0], '').trim();
          } catch (e) {
            console.error('Error parsing action parameters:', e);
          }
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: messageContent,
        isUser: false,
        timestamp: new Date(),
        actionRequest
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If there's an action request, try to execute it
      if (actionRequest) {
        try {
          await executeAction(actionRequest);
        } catch (error) {
          console.error('Error with action request:', error);
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar a mensagem. Tente novamente.",
        variant: "destructive",
      });

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
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
    "Cadastre um novo aluno para mim",
    "Quais alunos precisam de acompanhamento?",
    "Envie uma mensagem motivacional para todos os alunos",
    "Crie uma mensagem pré-definida de boas-vindas"
  ];

  const handleQuickAction = (action: string) => {
    setInputMessage(action);
  };

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Assistente IA Avançado</h3>
            <p className="text-xs text-muted-foreground">Com capacidade de ação no sistema</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-3">
        <div className="space-y-4">
          {messages.length === 1 && (
            <div className="space-y-2 mb-4">
              <p className="text-sm text-muted-foreground">Ações rápidas:</p>
              {quickActions.map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="w-full text-left justify-start h-auto p-2 text-xs whitespace-normal"
                  onClick={() => handleQuickAction(action)}
                >
                  {action}
                </Button>
              ))}
              <Separator className="my-3" />
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              <div className={`flex gap-2 ${message.isUser ? 'justify-end' : 'justify-start'}`}>
                {!message.isUser && (
                  <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                
                <Card className={`max-w-[80%] p-2 ${
                  message.isUser 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {message.actionRequest && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border-l-2 border-blue-400">
                      <p className="text-xs text-blue-800 font-medium">
                        🤖 Ação sugerida: {message.actionRequest.description}
                      </p>
                    </div>
                  )}
                  
                  {message.actionResult && (
                    <div className="mt-2 p-2 bg-green-50 rounded border-l-2 border-green-400">
                      <p className="text-xs text-green-800">
                        {message.actionResult.success ? '✅' : '❌'} {message.actionResult.message}
                      </p>
                    </div>
                  )}
                </Card>

                {message.isUser && (
                  <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <User className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
            </div>
          ))}

          {pendingAction && (
            <AIActionConfirmation
              action={pendingAction}
              onConfirm={handleActionConfirm}
              onReject={handleActionReject}
            />
          )}

          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <Bot className="h-3 w-3 text-primary" />
              </div>
              <Card className="bg-muted p-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <p className="text-sm">Processando...</p>
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua pergunta ou peça para eu fazer algo..."
            className="text-sm"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            size="sm"
            className="flex-shrink-0"
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
