
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Phone, Calendar, CheckCircle, Cake, MessageSquare, Smartphone, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

interface WhatsAppContact { jid: string; phone: string; name: string; }


export function CadastrarAlunoForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    dataNascimento: "",
    dataUltimaAvaliacao: "",
    fezAvaliacaoFisica: false,
    agendarMensagens: false
  });
  
  const [messageConfig, setMessageConfig] = useState({
    content: "",
    predefinedMessageId: "",
    schedulingMode: 'quick' as 'quick' | 'custom',
    quickScheduleOptions: { today: false, days7: true, days21: false, days45: false },
    quickScheduleTime: "10:00",
    scheduledDate: "",
    scheduledTime: ""
  });

  // Buscar mensagens predefinidas
  const { data: predefinedMessages = [] } = useQuery({
    queryKey: ['predefined-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('predefined_messages')
        .select('*')
        .order('title');
      
      if (error) throw error;
      return data || [];
    },
    enabled: formData.agendarMensagens
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    handleInputChange('telefone', formatted);
  };

  const updateMessageConfig = (field: string, value: any) => {
    setMessageConfig(prev => ({ ...prev, [field]: value }));
  };

  const handlePredefinedMessageChange = (predefinedId: string) => {
    if (predefinedId === "custom") {
      updateMessageConfig('predefinedMessageId', '');
      updateMessageConfig('content', '');
    } else {
      const predefined = predefinedMessages.find(msg => msg.id === predefinedId);
      if (predefined) {
        updateMessageConfig('predefinedMessageId', predefinedId);
        updateMessageConfig('content', predefined.content);
      }
    }
  };

  const calculateScheduleDates = () => {
    const now = new Date();
    const dates = [];
    
    if (messageConfig.quickScheduleOptions.today) {
      const todayDate = new Date();
      const [hours, minutes] = messageConfig.quickScheduleTime.split(':').map(Number);
      todayDate.setHours(hours, minutes, 0, 0);
      
      if (todayDate <= now) {
        todayDate.setDate(todayDate.getDate() + 1);
      }
      
      dates.push({
        date: todayDate,
        type: 'today_followup'
      });
    }
    
    if (messageConfig.quickScheduleOptions.days7) {
      const date7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const [hours, minutes] = messageConfig.quickScheduleTime.split(':').map(Number);
      date7.setHours(hours, minutes, 0, 0);
      
      dates.push({
        date: date7,
        type: '7_day_followup'
      });
    }
    
    if (messageConfig.quickScheduleOptions.days21) {
      const date21 = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
      const [hours, minutes] = messageConfig.quickScheduleTime.split(':').map(Number);
      date21.setHours(hours, minutes, 0, 0);
      
      dates.push({
        date: date21,
        type: '21_day_followup'
      });
    }
    
    if (messageConfig.quickScheduleOptions.days45) {
      const date45 = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      const [hours, minutes] = messageConfig.quickScheduleTime.split(':').map(Number);
      date45.setHours(hours, minutes, 0, 0);
      
      dates.push({
        date: date45,
        type: '45_day_followup'
      });
    }
    
    return dates;
  };

  const validateForm = () => {
    if (!formData.nome.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, insira o nome do aluno.",
        variant: "destructive"
      });
      return false;
    }

    if (!formData.telefone.trim()) {
      toast({
        title: "Telefone obrigatório",
        description: "Por favor, insira o número do WhatsApp.",
        variant: "destructive"
      });
      return false;
    }

    const phoneNumbers = formData.telefone.replace(/\D/g, '');
    if (phoneNumbers.length < 10 || phoneNumbers.length > 11) {
      toast({
        title: "Telefone inválido",
        description: "Por favor, insira um número de telefone válido.",
        variant: "destructive"
      });
      return false;
    }

    // Validar mensagens agendadas se estiver ativo
    if (formData.agendarMensagens) {
      if (!messageConfig.content.trim()) {
        toast({
          title: "Mensagem obrigatória",
          description: "Por favor, preencha o conteúdo da mensagem.",
          variant: "destructive"
        });
        return false;
      }

      if (messageConfig.schedulingMode === 'quick') {
        const hasSelectedOption = messageConfig.quickScheduleOptions.today || messageConfig.quickScheduleOptions.days7 || 
                                 messageConfig.quickScheduleOptions.days21 || messageConfig.quickScheduleOptions.days45;
        if (!hasSelectedOption) {
          toast({
            title: "Opção de agendamento obrigatória",
            description: "Selecione pelo menos uma opção de agendamento rápido.",
            variant: "destructive"
          });
          return false;
        }
      } else {
        if (!messageConfig.scheduledDate || !messageConfig.scheduledTime) {
          toast({
            title: "Data e hora obrigatórios",
            description: "Preencha a data e horário para agendamento personalizado.",
            variant: "destructive"
          });
          return false;
        }

        const scheduledFor = new Date(`${messageConfig.scheduledDate}T${messageConfig.scheduledTime}`);
        if (scheduledFor <= new Date()) {
          toast({
            title: "Data inválida",
            description: "A data e hora devem ser no futuro.",
            variant: "destructive"
          });
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const studentData = {
        name: formData.nome.trim(),
        phone: formData.telefone,
        birth_date: formData.dataNascimento || null,
        last_evaluation_date: formData.dataUltimaAvaliacao || null,
        had_evaluation: formData.fezAvaliacaoFisica
      };

      const { data, error } = await supabase
        .from('students')
        .insert([studentData])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Agendar mensagens personalizadas se o usuário escolher
      if (formData.agendarMensagens && messageConfig.content.trim()) {
        const messagesToSchedule = [];

        if (messageConfig.schedulingMode === 'quick') {
          const scheduleDates = calculateScheduleDates();
          
          for (const { date, type } of scheduleDates) {
            messagesToSchedule.push({
              student_id: data.id,
              content: messageConfig.content.replace(/\{nome\}/g, data.name),
              scheduled_for: date.toISOString(),
              message_type: type,
              status: 'pending'
            });
          }
        } else {
          const scheduledFor = new Date(`${messageConfig.scheduledDate}T${messageConfig.scheduledTime}`);
          
          messagesToSchedule.push({
            student_id: data.id,
            content: messageConfig.content.replace(/\{nome\}/g, data.name),
            scheduled_for: scheduledFor.toISOString(),
            message_type: 'manual',
            status: 'pending'
          });
        }

        if (messagesToSchedule.length > 0) {
          const { error: scheduleError } = await supabase
            .from('scheduled_messages')
            .insert(messagesToSchedule);

          if (scheduleError) {
            console.error('Error scheduling messages:', scheduleError);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['today-actions'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      
      const messageCount = formData.agendarMensagens ? 
        (messageConfig.schedulingMode === 'quick' ? calculateScheduleDates().length : 1) : 0;

      const successMessage = messageCount > 0
        ? `${formData.nome} foi adicionado ao sistema e ${messageCount} mensagens foram agendadas.`
        : `${formData.nome} foi adicionado ao sistema.`;

      toast({
        title: "Aluno cadastrado com sucesso!",
        description: successMessage,
      });

      setFormData({
        nome: "",
        telefone: "",
        dataNascimento: "",
        dataUltimaAvaliacao: "",
        fezAvaliacaoFisica: false,
        agendarMensagens: false
      });

      setMessageConfig({
        content: "",
        predefinedMessageId: "",
        schedulingMode: 'quick',
        quickScheduleOptions: { today: false, days7: true, days21: false, days45: false },
        quickScheduleTime: "10:00",
        scheduledDate: "",
        scheduledTime: ""
      });

    } catch (error: any) {
      console.error('Error saving student:', error);
      toast({
        title: "Erro ao cadastrar aluno",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <Card className="max-w-2xl shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Dados do Aluno
          </CardTitle>
          <CardDescription>
            Preencha as informações do aluno para adicioná-lo ao sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome" className="text-sm font-medium">
                Nome completo *
              </Label>
              <Input
                id="nome"
                type="text"
                placeholder="Ex: João Silva"
                value={formData.nome}
                onChange={(e) => handleInputChange('nome', e.target.value)}
                className="h-11"
              />
            </div>

            {/* Telefone */}
            <div className="space-y-2">
              <Label htmlFor="telefone" className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                WhatsApp *
              </Label>
              <Input
                id="telefone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={formData.telefone}
                onChange={handlePhoneChange}
                className="h-11"
                maxLength={15}
              />
              <p className="text-xs text-muted-foreground">
                Formato: (11) 99999-9999 - Incluir DDD
              </p>
            </div>

            {/* Data de nascimento */}
            <div className="space-y-2">
              <Label htmlFor="dataNascimento" className="text-sm font-medium flex items-center gap-2">
                <Cake className="h-4 w-4" />
                Data de nascimento
              </Label>
              <Input
                id="dataNascimento"
                type="date"
                value={formData.dataNascimento}
                onChange={(e) => handleInputChange('dataNascimento', e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Usado para enviar mensagens de aniversário
              </p>
            </div>

            {/* Switch Avaliação Física */}
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="fezAvaliacaoFisica" className="text-sm font-medium">
                  Fez avaliação física?
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marque se o aluno já realizou avaliação física na academia
                </p>
              </div>
              <Switch
                id="fezAvaliacaoFisica"
                checked={formData.fezAvaliacaoFisica}
                onCheckedChange={(checked) => {
                  handleInputChange('fezAvaliacaoFisica', checked);
                  if (!checked) {
                    handleInputChange('dataUltimaAvaliacao', '');
                  }
                }}
              />
            </div>

            {/* Data da última avaliação - só aparece se marcou que fez avaliação */}
            {formData.fezAvaliacaoFisica && (
              <div className="space-y-2">
                <Label htmlFor="dataUltimaAvaliacao" className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data da última avaliação física
                </Label>
                <Input
                  id="dataUltimaAvaliacao"
                  type="date"
                  value={formData.dataUltimaAvaliacao}
                  onChange={(e) => handleInputChange('dataUltimaAvaliacao', e.target.value)}
                  className="h-11"
                />
              </div>
            )}

            {/* Switch Agendar Mensagens */}
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="space-y-1">
                <Label htmlFor="agendarMensagens" className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Agendar mensagens automáticas?
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marque para configurar mensagens de acompanhamento personalizadas
                </p>
              </div>
              <Switch
                id="agendarMensagens"
                checked={formData.agendarMensagens}
                onCheckedChange={(checked) => handleInputChange('agendarMensagens', checked)}
              />
            </div>

            {/* Interface de Agendamento de Mensagens */}
            {formData.agendarMensagens && (
              <Card className="border-primary/20">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Configurar Mensagem Automática
                  </CardTitle>
                  <CardDescription>
                    Configure a mensagem que será enviada automaticamente após o cadastro. Use {"{nome}"} para inserir o nome do aluno.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 border rounded-lg space-y-4">
                    {/* Mensagem Predefinida */}
                    <div className="space-y-2">
                      <Label>Mensagem Predefinida (Opcional)</Label>
                      <Select 
                        value={messageConfig.predefinedMessageId || "custom"} 
                        onValueChange={handlePredefinedMessageChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolher mensagem predefinida (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Mensagem personalizada</SelectItem>
                          {predefinedMessages.map((msg) => (
                            <SelectItem key={msg.id} value={msg.id}>
                              {msg.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Conteúdo da Mensagem */}
                    <div className="space-y-2">
                      <Label>Conteúdo da Mensagem</Label>
                      <Textarea
                        placeholder="Digite sua mensagem aqui... Use {nome} para inserir o nome do aluno."
                        value={messageConfig.content}
                        onChange={(e) => updateMessageConfig('content', e.target.value)}
                        rows={3}
                        maxLength={1000}
                      />
                      <p className="text-xs text-muted-foreground">
                        {messageConfig.content.length}/1000 caracteres
                      </p>
                    </div>

                    {/* Tipo de Agendamento */}
                    <div className="space-y-3">
                      <Label>Tipo de Agendamento</Label>
                      <div className="flex gap-4">
                        <Button
                          type="button"
                          variant={messageConfig.schedulingMode === 'quick' ? 'default' : 'outline'}
                          onClick={() => updateMessageConfig('schedulingMode', 'quick')}
                          className="flex-1"
                        >
                          Agendamento Rápido
                        </Button>
                        <Button
                          type="button"
                          variant={messageConfig.schedulingMode === 'custom' ? 'default' : 'outline'}
                          onClick={() => updateMessageConfig('schedulingMode', 'custom')}
                          className="flex-1"
                        >
                          Data Personalizada
                        </Button>
                      </div>

                      {messageConfig.schedulingMode === 'quick' && (
                        <div className="space-y-3 p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <p className="text-sm text-muted-foreground mb-2">
                                Selecione quando enviar a mensagem (pode escolher múltiplas opções):
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label htmlFor="quickTime" className="text-sm">Horário:</Label>
                              <Input
                                id="quickTime"
                                type="time"
                                value={messageConfig.quickScheduleTime}
                                onChange={(e) => updateMessageConfig('quickScheduleTime', e.target.value)}
                                className="w-24"
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="today"
                                checked={messageConfig.quickScheduleOptions.today}
                                onCheckedChange={(checked) => 
                                  updateMessageConfig('quickScheduleOptions', {
                                    ...messageConfig.quickScheduleOptions,
                                    today: checked as boolean
                                  })
                                }
                              />
                              <Label htmlFor="today" className="text-sm">
                                Hoje ({new Date().toLocaleDateString('pt-BR')}) às {messageConfig.quickScheduleTime}
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="days7"
                                checked={messageConfig.quickScheduleOptions.days7}
                                onCheckedChange={(checked) => 
                                  updateMessageConfig('quickScheduleOptions', {
                                    ...messageConfig.quickScheduleOptions,
                                    days7: checked as boolean
                                  })
                                }
                              />
                              <Label htmlFor="days7" className="text-sm">
                                Daqui a 7 dias ({new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}) às {messageConfig.quickScheduleTime}
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="days21"
                                checked={messageConfig.quickScheduleOptions.days21}
                                onCheckedChange={(checked) => 
                                  updateMessageConfig('quickScheduleOptions', {
                                    ...messageConfig.quickScheduleOptions,
                                    days21: checked as boolean
                                  })
                                }
                              />
                              <Label htmlFor="days21" className="text-sm">
                                Daqui a 21 dias ({new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}) às {messageConfig.quickScheduleTime}
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="days45"
                                checked={messageConfig.quickScheduleOptions.days45}
                                onCheckedChange={(checked) => 
                                  updateMessageConfig('quickScheduleOptions', {
                                    ...messageConfig.quickScheduleOptions,
                                    days45: checked as boolean
                                  })
                                }
                              />
                              <Label htmlFor="days45" className="text-sm">
                                Daqui a 45 dias ({new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}) às {messageConfig.quickScheduleTime}
                              </Label>
                            </div>
                          </div>
                        </div>
                      )}

                      {messageConfig.schedulingMode === 'custom' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="date">Data</Label>
                            <Input
                              id="date"
                              type="date"
                              value={messageConfig.scheduledDate}
                              onChange={(e) => updateMessageConfig('scheduledDate', e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="time">Horário</Label>
                            <Input
                              id="time"
                              type="time"
                              value={messageConfig.scheduledTime}
                              onChange={(e) => updateMessageConfig('scheduledTime', e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                    Cadastrando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Cadastrar Aluno
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="max-w-2xl bg-accent/50 shadow-card">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">
                Mensagens Automáticas Personalizadas
              </h3>
              <p className="text-sm text-muted-foreground">
                Configure uma mensagem totalmente personalizada com agendamento rápido ou data específica. 
                Use mensagens predefinidas ou crie conteúdo personalizado. A mensagem será enviada 
                automaticamente no horário configurado após o cadastro do aluno.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
