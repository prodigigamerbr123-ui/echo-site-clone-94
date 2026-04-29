
import { useState, useEffect } from "react";
import { Clock, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import MessageFilters from "../components/agendarmensagem/MessageFilters";
import MessagesList, { getFilteredMessagesCount } from "../components/agendarmensagem/MessagesList";

interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
  message_type: string;
  created_at: string;
  student_id: string;
  students?: {
    name: string;
    phone: string;
  };
}

interface Student {
  id: string;
  name: string;
  phone: string;
}

interface PredefinedMessage {
  id: string;
  title: string;
  content: string;
}

export default function MensagensAgendadas() {
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  
  // Form states
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedPredefinedMessage, setSelectedPredefinedMessage] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [schedulingMode, setSchedulingMode] = useState<'quick' | 'custom'>('quick');
  const [quickScheduleOptions, setQuickScheduleOptions] = useState({
    today: false,
    days7: false,
    days21: false,
    days45: false
  });
  const [quickScheduleTime, setQuickScheduleTime] = useState("10:00");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [saving, setSaving] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchScheduledMessages();
    fetchStudents();
    fetchPredefinedMessages();
  }, []);

  const fetchScheduledMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select(`
          *,
          students (
            name,
            phone
          )
        `)
        .neq('status', 'sent')
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      setScheduledMessages(data || []);
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens agendadas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, phone')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchPredefinedMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('predefined_messages')
        .select('id, title, content')
        .order('title');

      if (error) throw error;
      setPredefinedMessages(data || []);
    } catch (error) {
      console.error('Error fetching predefined messages:', error);
    }
  };

  const handlePredefinedMessageSelect = (messageId: string) => {
    const predefinedMessage = predefinedMessages.find(msg => msg.id === messageId);
    if (predefinedMessage) {
      setMessageContent(predefinedMessage.content);
    }
  };

  const calculateScheduleDates = () => {
    const now = new Date();
    const dates = [];
    
    if (quickScheduleOptions.today) {
      const todayDate = new Date();
      const [hours, minutes] = quickScheduleTime.split(':').map(Number);
      todayDate.setHours(hours, minutes, 0, 0);
      
      // Se o horário já passou hoje, agenda para amanhã
      if (todayDate <= now) {
        todayDate.setDate(todayDate.getDate() + 1);
      }
      
      dates.push({
        date: todayDate,
        type: 'today_followup'
      });
    }
    
    if (quickScheduleOptions.days7) {
      const date7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const [hours, minutes] = quickScheduleTime.split(':').map(Number);
      date7.setHours(hours, minutes, 0, 0);
      
      dates.push({
        date: date7,
        type: '7_day_followup'
      });
    }
    
    if (quickScheduleOptions.days21) {
      const date21 = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
      const [hours, minutes] = quickScheduleTime.split(':').map(Number);
      date21.setHours(hours, minutes, 0, 0);
      
      dates.push({
        date: date21,
        type: '21_day_followup'
      });
    }
    
    if (quickScheduleOptions.days45) {
      const date45 = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      const [hours, minutes] = quickScheduleTime.split(':').map(Number);
      date45.setHours(hours, minutes, 0, 0);
      
      dates.push({
        date: date45,
        type: '45_day_followup'
      });
    }
    
    return dates;
  };

  const handleSaveMessage = async () => {
    if (!selectedStudent || !messageContent.trim()) {
      toast({
        title: "Atenção",
        description: "Preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    if (schedulingMode === 'quick') {
      const hasSelectedOption = quickScheduleOptions.today || quickScheduleOptions.days7 || quickScheduleOptions.days21 || quickScheduleOptions.days45;
      if (!hasSelectedOption) {
        toast({
          title: "Atenção",
          description: "Selecione pelo menos uma opção de agendamento rápido.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!scheduledDate || !scheduledTime) {
        toast({
          title: "Atenção",
          description: "Preencha a data e horário para agendamento personalizado.",
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);

    try {
      if (editingMessage) {
        // Update existing message
        const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);
        
        if (scheduledFor <= new Date()) {
          toast({
            title: "Atenção",
            description: "A data e hora devem ser no futuro.",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from('scheduled_messages')
          .update({
            student_id: selectedStudent,
            content: messageContent.trim(),
            scheduled_for: scheduledFor.toISOString(),
            message_type: 'manual',
            status: 'pending'
          })
          .eq('id', editingMessage.id);

        if (error) throw error;

        toast({
          title: "Sucesso!",
          description: "Mensagem atualizada com sucesso.",
        });
      } else {
        // Create new message(s)
        const messagesToCreate = [];

        if (schedulingMode === 'quick') {
          const scheduleDates = calculateScheduleDates();
          
          for (const { date, type } of scheduleDates) {
            messagesToCreate.push({
              student_id: selectedStudent,
              content: messageContent.trim(),
              scheduled_for: date.toISOString(),
              message_type: type,
              status: 'pending'
            });
          }
        } else {
          const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);
          
          if (scheduledFor <= new Date()) {
            toast({
              title: "Atenção",
              description: "A data e hora devem ser no futuro.",
              variant: "destructive",
            });
            setSaving(false);
            return;
          }

          messagesToCreate.push({
            student_id: selectedStudent,
            content: messageContent.trim(),
            scheduled_for: scheduledFor.toISOString(),
            message_type: 'manual',
            status: 'pending'
          });
        }

        const { error } = await supabase
          .from('scheduled_messages')
          .insert(messagesToCreate);

        if (error) throw error;

        const messageCount = messagesToCreate.length;
        const messageText = messageCount === 1 ? 'Mensagem agendada' : `${messageCount} mensagens agendadas`;
        
        toast({
          title: "Sucesso!",
          description: `${messageText} com sucesso.`,
        });
      }

      resetForm();
      fetchScheduledMessages();
    } catch (error) {
      console.error('Error saving scheduled message:', error);
      toast({
        title: "Erro",
        description: "Não foi possível agendar a mensagem.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedStudent("");
    setSelectedPredefinedMessage("");
    setMessageContent("");
    setSchedulingMode('quick');
    setQuickScheduleOptions({ today: false, days7: false, days21: false, days45: false });
    setQuickScheduleTime("10:00");
    setScheduledDate("");
    setScheduledTime("");
    setEditingMessage(null);
    setIsDialogOpen(false);
  };

  const handleEditMessage = (message: ScheduledMessage) => {
    setEditingMessage(message);
    setSelectedStudent(message.student_id);
    setMessageContent(message.content);
    setSchedulingMode('custom');
    
    const scheduledDate = new Date(message.scheduled_for);
    setScheduledDate(scheduledDate.toISOString().split('T')[0]);
    setScheduledTime(scheduledDate.toTimeString().slice(0, 5));
    
    setIsDialogOpen(true);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta mensagem agendada?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Mensagem agendada excluída.",
      });
      
      fetchScheduledMessages();
      setSelectedMessages(prev => prev.filter(id => id !== messageId));
    } catch (error) {
      console.error('Error deleting scheduled message:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a mensagem.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedMessages.length === 0) return;
    
    if (!confirm(`Tem certeza que deseja excluir ${selectedMessages.length} mensagem(ns) selecionada(s)?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .in('id', selectedMessages);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: `${selectedMessages.length} mensagem(ns) excluída(s).`,
      });
      
      setSelectedMessages([]);
      fetchScheduledMessages();
    } catch (error) {
      console.error('Error deleting selected messages:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir as mensagens selecionadas.",
        variant: "destructive",
      });
    }
  };

  const handleMessageSelect = (messageId: string, isSelected: boolean) => {
    setSelectedMessages(prev => 
      isSelected 
        ? [...prev, messageId]
        : prev.filter(id => id !== messageId)
    );
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      const filteredMessages = scheduledMessages.filter((message) => {
        const matchesSearch = 
          message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          message.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          message.students?.phone.includes(searchTerm);
        
        const matchesStudents = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);
        
        return matchesSearch && matchesStudents;
      });
      
      setSelectedMessages(filteredMessages.map(msg => msg.id));
    } else {
      setSelectedMessages([]);
    }
  };

  const openNewMessageDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const filteredCount = getFilteredMessagesCount(scheduledMessages, searchTerm, dateFilter, customDateRange, selectedStudents);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando mensagens agendadas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agendar Mensagem</h1>
            <p className="text-muted-foreground">
              Gerencie suas mensagens programadas para envio futuro
            </p>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewMessageDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Mensagem Agendada
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingMessage ? 'Editar' : 'Nova'} Mensagem Agendada
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="student">Aluno</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} - {student.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!editingMessage && (
                <div>
                  <Label htmlFor="predefinedMessage">Mensagem Pré-definida (Opcional)</Label>
                  <Select value={selectedPredefinedMessage} onValueChange={(value) => {
                    setSelectedPredefinedMessage(value);
                    if (value) {
                      handlePredefinedMessageSelect(value);
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha uma mensagem pré-definida" />
                    </SelectTrigger>
                    <SelectContent>
                      {predefinedMessages.map((message) => (
                        <SelectItem key={message.id} value={message.id}>
                          {message.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div>
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  placeholder="Digite a mensagem..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  className="min-h-24"
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {messageContent.length}/1000 caracteres
                </p>
              </div>

              {!editingMessage && (
                <div>
                  <Label>Tipo de Agendamento</Label>
                  <div className="space-y-4 mt-2">
                    <div className="flex gap-4">
                      <Button
                        type="button"
                        variant={schedulingMode === 'quick' ? 'default' : 'outline'}
                        onClick={() => setSchedulingMode('quick')}
                        className="flex-1"
                      >
                        Agendamento Rápido
                      </Button>
                      <Button
                        type="button"
                        variant={schedulingMode === 'custom' ? 'default' : 'outline'}
                        onClick={() => setSchedulingMode('custom')}
                        className="flex-1"
                      >
                        Data Personalizada
                      </Button>
                    </div>

                    {schedulingMode === 'quick' && (
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
                              value={quickScheduleTime}
                              onChange={(e) => setQuickScheduleTime(e.target.value)}
                              className="w-24"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="today"
                              checked={quickScheduleOptions.today}
                              onCheckedChange={(checked) => 
                                setQuickScheduleOptions(prev => ({ ...prev, today: checked as boolean }))
                              }
                            />
                            <Label htmlFor="today" className="text-sm">
                              Hoje ({new Date().toLocaleDateString('pt-BR')}) às {quickScheduleTime}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="days7"
                              checked={quickScheduleOptions.days7}
                              onCheckedChange={(checked) => 
                                setQuickScheduleOptions(prev => ({ ...prev, days7: checked as boolean }))
                              }
                            />
                            <Label htmlFor="days7" className="text-sm">
                              Daqui a 7 dias ({new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}) às {quickScheduleTime}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="days21"
                              checked={quickScheduleOptions.days21}
                              onCheckedChange={(checked) => 
                                setQuickScheduleOptions(prev => ({ ...prev, days21: checked as boolean }))
                              }
                            />
                            <Label htmlFor="days21" className="text-sm">
                              Daqui a 21 dias ({new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}) às {quickScheduleTime}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="days45"
                              checked={quickScheduleOptions.days45}
                              onCheckedChange={(checked) => 
                                setQuickScheduleOptions(prev => ({ ...prev, days45: checked as boolean }))
                              }
                            />
                            <Label htmlFor="days45" className="text-sm">
                              Daqui a 45 dias ({new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}) às {quickScheduleTime}
                            </Label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {(schedulingMode === 'custom' || editingMessage) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date">Data</Label>
                    <Input
                      id="date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="time">Horário</Label>
                    <Input
                      id="time"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
              
              <Button 
                onClick={handleSaveMessage}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Salvando...
                  </div>
                ) : (
                  editingMessage ? 'Atualizar' : 'Agendar Mensagem'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MessageFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            customDateRange={customDateRange}
            setCustomDateRange={setCustomDateRange}
            students={students}
            selectedStudents={selectedStudents}
            setSelectedStudents={setSelectedStudents}
          />
        </CardContent>
      </Card>

      {/* Messages List */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagens Agendadas ({filteredCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduledMessages.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Nenhuma mensagem agendada ainda.
              </p>
              <Button onClick={openNewMessageDialog} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Agendar Primeira Mensagem
              </Button>
            </div>
          ) : (
            <MessagesList
              messages={scheduledMessages}
              searchTerm={searchTerm}
              dateFilter={dateFilter}
              customDateRange={customDateRange}
              selectedStudents={selectedStudents}
              selectedMessages={selectedMessages}
              onMessageSelect={handleMessageSelect}
              onSelectAll={handleSelectAll}
              onDeleteSelected={handleDeleteSelected}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
