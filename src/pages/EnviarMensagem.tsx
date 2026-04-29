import { useState, useEffect } from "react";
import { Search, Send, Users, MessageSquare, Calendar, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";

interface Student {
  id: string;
  name: string;
  phone: string;
  last_evaluation_date: string | null;
  had_evaluation: boolean;
  created_at: string;
}

interface PredefinedMessage {
  id: string;
  title: string;
  content: string;
}

interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  message_type: string;
  status: string;
  student_id: string;
  students: {
    name: string;
    phone: string;
  };
}

export default function EnviarMensagem() {
  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedScheduledMessages, setSelectedScheduledMessages] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPredefined, setSelectedPredefined] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchStudents();
    fetchPredefinedMessages();
    fetchTodayScheduledMessages();
  }, []);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a lista de alunos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPredefinedMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('predefined_messages')
        .select('*')
        .order('title');

      if (error) throw error;
      setPredefinedMessages(data || []);
    } catch (error) {
      console.error('Error fetching predefined messages:', error);
    }
  };

  const fetchTodayScheduledMessages = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const { data, error } = await supabase
        .from('scheduled_messages')
        .select(`
          *,
          students (
            name,
            phone
          )
        `)
        .eq('status', 'pending')
        .gte('scheduled_for', startOfDay.toISOString())
        .lt('scheduled_for', endOfDay.toISOString())
        .order('scheduled_for');

      if (error) throw error;
      setScheduledMessages(data || []);
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens agendadas.",
        variant: "destructive",
      });
    }
  };

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.phone.includes(searchTerm)
  );

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(student => student.id));
    }
  };

  const handlePredefinedSelect = (messageId: string) => {
    const selectedMessage = predefinedMessages.find(msg => msg.id === messageId);
    if (selectedMessage) {
      setMessage(selectedMessage.content);
      setSelectedPredefined(messageId);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove all non-digit characters
    let formattedPhone = phone.replace(/\D/g, '');
    
    // Add Brazil country code if not present
    if (!formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }
    
    return formattedPhone;
  };

  const handleScheduledMessageToggle = (messageId: string) => {
    setSelectedScheduledMessages(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleSelectAllScheduled = () => {
    if (selectedScheduledMessages.length === scheduledMessages.length) {
      setSelectedScheduledMessages([]);
    } else {
      setSelectedScheduledMessages(scheduledMessages.map(msg => msg.id));
    }
  };

  const handleSendScheduledMessages = async () => {
    if (selectedScheduledMessages.length === 0) {
      toast({
        title: "Atenção",
        description: "Selecione pelo menos uma mensagem para enviar.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      const selectedMessages = scheduledMessages.filter(msg => 
        selectedScheduledMessages.includes(msg.id)
      );

      // Open WhatsApp for each selected message
      for (const scheduledMsg of selectedMessages) {
        const formattedPhone = formatPhoneNumber(scheduledMsg.students.phone);
        const encodedMessage = encodeURIComponent(scheduledMsg.content);
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;
        
        // Open WhatsApp in new tab
        window.open(whatsappUrl, '_blank');
      }

      // Update scheduled messages status to 'sent'
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .in('id', selectedScheduledMessages);

      if (error) {
        console.error('Error updating scheduled messages:', error);
        toast({
          title: "Aviso",
          description: "WhatsApp aberto para envio, mas houve erro ao atualizar o status das mensagens.",
          variant: "destructive",
        });
      }

      // Save messages to the messages table
      const messagesToSave = selectedMessages.map(msg => ({
        student_id: msg.student_id,
        content: msg.content,
        status: 'sent',
      }));

      if (messagesToSave.length > 0) {
        const { error: dbError } = await supabase
          .from('messages')
          .insert(messagesToSave);

        if (dbError) {
          console.error('Error saving messages to database:', dbError);
        }
      }

      toast({
        title: "Sucesso!",
        description: `${selectedMessages.length} aba(s) do WhatsApp aberta(s). Envie as mensagens clicando no botão de enviar em cada conversa.`,
      });

      // Clear selection and refresh the list
      setSelectedScheduledMessages([]);
      fetchTodayScheduledMessages();
    } catch (error) {
      console.error('Error sending scheduled messages:', error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar as mensagens. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      toast({
        title: "Atenção",
        description: "Digite uma mensagem antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    if (selectedStudents.length === 0) {
      toast({
        title: "Atenção",
        description: "Selecione pelo menos um aluno para enviar a mensagem.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      // Get student details
      const selectedStudentDetails = students.filter(student => 
        selectedStudents.includes(student.id)
      );

      // Encode message for URL
      const encodedMessage = encodeURIComponent(message);

      // Save messages to database and open WhatsApp for each student
      const messagesToSave = [];
      
      for (const student of selectedStudentDetails) {
        const formattedPhone = formatPhoneNumber(student.phone);
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;
        
        // Open WhatsApp in new tab
        window.open(whatsappUrl, '_blank');
        
        // Prepare message for database
        messagesToSave.push({
          student_id: student.id,
          content: message,
          status: 'sent',
        });
      }

      // Save all messages to database
      if (messagesToSave.length > 0) {
        const { error: dbError } = await supabase
          .from('messages')
          .insert(messagesToSave);

        if (dbError) {
          console.error('Error saving messages to database:', dbError);
          toast({
            title: "Aviso",
            description: "WhatsApp aberto para envio, mas houve erro ao salvar no histórico.",
            variant: "destructive",
          });
        } else {
          console.log(`Saved ${messagesToSave.length} messages to database`);
        }
      }

      toast({
        title: "Sucesso!",
        description: `${selectedStudentDetails.length} aba(s) do WhatsApp aberta(s). Envie as mensagens clicando no botão de enviar em cada conversa.`,
      });

      // Clear form
      setMessage("");
      setSelectedStudents([]);
      setSelectedPredefined("");
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o WhatsApp. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Send className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Enviar Mensagem</h1>
          <p className="text-muted-foreground">
            Envie mensagens personalizadas, mensagens agendadas ou consulte o histórico
          </p>
        </div>
      </div>

      <Tabs defaultValue="mensagens-do-dia" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="mensagens-do-dia">
            Enviar Mensagens do Dia ({scheduledMessages.length})
          </TabsTrigger>
          <TabsTrigger value="nova-mensagem">Nova Mensagem</TabsTrigger>
          <TabsTrigger value="mensagens-enviadas">
            <MessageCircle className="h-4 w-4 mr-2" />
            Mensagens Enviadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mensagens-do-dia" className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Mensagens Agendadas para Hoje ({selectedScheduledMessages.length} selecionadas)
              </CardTitle>
              
              {scheduledMessages.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSelectAllScheduled}
                    className="shrink-0"
                  >
                    {selectedScheduledMessages.length === scheduledMessages.length ? "Desmarcar Todas" : "Selecionar Todas"}
                  </Button>
                  <Button
                    onClick={handleSendScheduledMessages}
                    disabled={sending || selectedScheduledMessages.length === 0}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {sending ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Enviando...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        Enviar Selecionadas ({selectedScheduledMessages.length})
                      </div>
                    )}
                  </Button>
                </div>
              )}
            </CardHeader>
            
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {scheduledMessages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma mensagem agendada para hoje.
                </p>
              ) : (
                scheduledMessages.map((scheduledMsg) => (
                  <div
                    key={scheduledMsg.id}
                    className={`flex items-start space-x-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer ${
                      selectedScheduledMessages.includes(scheduledMsg.id) ? 'bg-accent/50 border-primary/50' : ''
                    }`}
                    onClick={() => handleScheduledMessageToggle(scheduledMsg.id)}
                  >
                    <Checkbox
                      checked={selectedScheduledMessages.includes(scheduledMsg.id)}
                      onChange={() => {}} // Controlled by parent div click
                      className="mt-1 pointer-events-none"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{scheduledMsg.students.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {scheduledMsg.message_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{scheduledMsg.students.phone}</p>
                      <div className="p-2 bg-accent/30 rounded text-sm text-foreground">
                        {scheduledMsg.content}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Agendada para: {new Date(scheduledMsg.scheduled_for).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {selectedScheduledMessages.length > 0 && (
            <div className="p-3 bg-accent/50 rounded-lg">
              <p className="text-sm text-foreground font-medium mb-1">
                Mensagens selecionadas: {selectedScheduledMessages.length}
              </p>
              <p className="text-sm text-muted-foreground">
                {scheduledMessages
                  .filter(msg => selectedScheduledMessages.includes(msg.id))
                  .map(msg => msg.students.name)
                  .join(", ")}
              </p>
            </div>
          )}

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Como funciona:</strong> Selecione as mensagens que deseja enviar hoje e clique em "Enviar Selecionadas". Uma nova aba do WhatsApp será aberta para cada mensagem com o conteúdo já preenchido.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="nova-mensagem" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista de Alunos */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Selecionar Alunos ({selectedStudents.length} selecionados)
                </CardTitle>
                
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou telefone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleSelectAll}
                    className="shrink-0"
                  >
                    {selectedStudents.length === filteredStudents.length ? "Desmarcar Todos" : "Selecionar Todos"}
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {searchTerm ? "Nenhum aluno encontrado." : "Nenhum aluno cadastrado."}
                  </p>
                ) : (
                  filteredStudents.map((student) => (
                    <div
                      key={student.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer ${
                        selectedStudents.includes(student.id) ? 'bg-accent/50 border-primary/50' : ''
                      }`}
                      onClick={() => handleStudentToggle(student.id)}
                    >
                      <Checkbox
                        checked={selectedStudents.includes(student.id)}
                        onChange={() => {}} // Controlled by parent div click
                        className="pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{student.name}</p>
                        <p className="text-sm text-muted-foreground">{student.phone}</p>
                      </div>
                      {student.had_evaluation && (
                        <Badge variant="secondary" className="text-xs">
                          Avaliado
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Composição da Mensagem */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Mensagem
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Mensagens Pré-definidas */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Mensagens Pré-definidas
                  </label>
                  <Select value={selectedPredefined} onValueChange={handlePredefinedSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma mensagem pré-definida" />
                    </SelectTrigger>
                    <SelectContent>
                      {predefinedMessages.map((msg) => (
                        <SelectItem key={msg.id} value={msg.id}>
                          {msg.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Campo de Mensagem */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Conteúdo da Mensagem
                  </label>
                  <Textarea
                    placeholder="Digite sua mensagem aqui ou selecione uma mensagem pré-definida..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="min-h-32 resize-none"
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {message.length}/1000 caracteres
                  </p>
                </div>

                {/* Botão de Enviar */}
                <Button
                  onClick={handleSendMessage}
                  disabled={sending || !message.trim() || selectedStudents.length === 0}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {sending ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Abrindo WhatsApp...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Enviar via WhatsApp ({selectedStudents.length})
                    </div>
                  )}
                </Button>

                {selectedStudents.length > 0 && (
                  <div className="p-3 bg-accent/50 rounded-lg">
                    <p className="text-sm text-foreground font-medium mb-1">
                      Alunos selecionados:
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {students
                        .filter(s => selectedStudents.includes(s.id))
                        .map(s => s.name)
                        .join(", ")}
                    </p>
                  </div>
                )}

                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Como funciona:</strong> Ao clicar em "Enviar via WhatsApp", uma nova aba será aberta para cada aluno selecionado com a mensagem já preenchida. Você só precisa clicar em enviar em cada conversa do WhatsApp.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="mensagens-enviadas" className="space-y-6">
          <MensagensEnviadasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
