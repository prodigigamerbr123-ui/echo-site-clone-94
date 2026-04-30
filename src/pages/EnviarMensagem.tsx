import { useState, useEffect } from "react";
import { Search, Send, Users, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Student { id: string; name: string; phone: string; had_evaluation: boolean; }
interface PredefinedMessage { id: string; title: string; content: string; }

export default function EnviarMensagem() {
  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPredefined, setSelectedPredefined] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      await Promise.all([fetchStudents(), fetchPredefinedMessages()]);
      setLoading(false);
    })();
  }, []);

  const fetchStudents = async () => {
    const { data } = await supabase.from('students').select('id, name, phone, had_evaluation').order('name');
    setStudents(data || []);
  };
  const fetchPredefinedMessages = async () => {
    const { data } = await supabase.from('predefined_messages').select('*').order('title');
    setPredefinedMessages(data || []);
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)
  );

  const handleStudentToggle = (id: string) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const handleSelectAll = () => {
    setSelectedStudents(selectedStudents.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));
  };
  const handlePredefinedSelect = (id: string) => {
    const m = predefinedMessages.find(x => x.id === id);
    if (m) { setMessage(m.content); setSelectedPredefined(id); }
  };


  const handleSendMessage = async () => {
    if (!message.trim()) {
      toast({ title: "Atenção", description: "Digite uma mensagem.", variant: "destructive" });
      return;
    }
    if (selectedStudents.length === 0) {
      toast({ title: "Atenção", description: "Selecione pelo menos um aluno.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const selected = students.filter(s => selectedStudents.includes(s.id));
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { students: selected, message },
      });
      if (error) throw error;
      const { sent = 0, failed = 0 } = data?.summary || {};
      toast({
        title: sent > 0 ? "Mensagens enviadas!" : "Falha ao enviar",
        description: `${sent} enviada(s)${failed > 0 ? `, ${failed} falhou` : ''}.`,
        variant: failed > 0 && sent === 0 ? "destructive" : "default",
      });
      setMessage("");
      setSelectedStudents([]);
      setSelectedPredefined("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
          <h1 className="text-2xl font-bold">Envio Manual</h1>
          <p className="text-muted-foreground">Envio manual via WhatsApp pela Evolution API</p>
        </div>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm">
            <Link to="/mensagens-agendadas">Ver Mensagens Agendadas</Link>
          </Button>
        </div>
      </div>

      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
        <p className="text-sm">
          <strong>Envio direto:</strong> As mensagens são enviadas pela Evolution API conectada ao WhatsApp da academia. Mensagens agendadas também são enviadas automaticamente no horário programado.
        </p>
      </div>

      {/* Seção: Nova Mensagem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Selecionar Alunos ({selectedStudents.length})
            </CardTitle>
            <div className="flex gap-2 pt-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Button variant="outline" onClick={handleSelectAll} className="shrink-0">
                {selectedStudents.length === filteredStudents.length ? "Desmarcar" : "Todos"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {filteredStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{searchTerm ? "Nenhum aluno encontrado." : "Nenhum aluno cadastrado."}</p>
            ) : (
              filteredStudents.map(s => (
                <div
                  key={s.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer ${
                    selectedStudents.includes(s.id) ? 'bg-accent/50 border-primary/50' : 'border-border'
                  }`}
                  onClick={() => handleStudentToggle(s.id)}
                >
                  <Checkbox checked={selectedStudents.includes(s.id)} className="pointer-events-none" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.phone}</p>
                  </div>
                  {s.had_evaluation && <Badge variant="secondary" className="text-xs">Avaliado</Badge>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Nova Mensagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Pré-definidas</label>
              <Select value={selectedPredefined} onValueChange={handlePredefinedSelect}>
                <SelectTrigger><SelectValue placeholder="Escolha uma mensagem" /></SelectTrigger>
                <SelectContent>
                  {predefinedMessages.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Conteúdo</label>
              <Textarea
                placeholder="Digite a mensagem..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="min-h-32"
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground mt-1">{message.length}/1000</p>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={sending || !message.trim() || selectedStudents.length === 0}
              className="w-full"
            >
              {sending ? "Enviando..." : (
                <><Send className="h-4 w-4 mr-2" />Enviar via WhatsApp ({selectedStudents.length})</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
