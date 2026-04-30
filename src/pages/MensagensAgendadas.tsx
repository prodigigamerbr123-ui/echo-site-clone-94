import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  students?: { name: string; phone: string; };
}

interface Student { id: string; name: string; phone: string; }

export default function MensagensAgendadas() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStudent, setEditStudent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchScheduledMessages();
    fetchStudents();
  }, []);

  const fetchScheduledMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select(`*, students (name, phone)`)
        .neq('status', 'sent')
        .order('scheduled_for', { ascending: true });
      if (error) throw error;
      setScheduledMessages(data || []);
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível carregar as mensagens.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    const { data } = await supabase.from('students').select('id, name, phone').order('name');
    setStudents(data || []);
  };

  const handleEditMessage = (message: ScheduledMessage) => {
    setEditingMessage(message);
    setEditStudent(message.student_id);
    setEditContent(message.content);
    const d = new Date(message.scheduled_for);
    setEditDate(d.toISOString().split('T')[0]);
    setEditTime(d.toTimeString().slice(0, 5));
  };

  const handleSaveEdit = async () => {
    if (!editingMessage) return;
    const scheduledFor = new Date(`${editDate}T${editTime}`);
    if (scheduledFor <= new Date()) {
      toast({ title: "Atenção", description: "A data deve ser futura.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({
          student_id: editStudent,
          content: editContent.trim(),
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending',
        })
        .eq('id', editingMessage.id);
      if (error) throw error;
      toast({ title: "Mensagem atualizada" });
      setEditingMessage(null);
      fetchScheduledMessages();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Excluir esta mensagem agendada?')) return;
    try {
      const { error } = await supabase.from('scheduled_messages').delete().eq('id', messageId);
      if (error) throw error;
      toast({ title: "Excluída" });
      fetchScheduledMessages();
      setSelectedMessages(prev => prev.filter(id => id !== messageId));
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedMessages.length === 0) return;
    if (!confirm(`Excluir ${selectedMessages.length} mensagem(ns)?`)) return;
    try {
      const { error } = await supabase.from('scheduled_messages').delete().in('id', selectedMessages);
      if (error) throw error;
      toast({ title: `${selectedMessages.length} excluída(s)` });
      setSelectedMessages([]);
      fetchScheduledMessages();
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handleMessageSelect = (id: string, sel: boolean) => {
    setSelectedMessages(prev => sel ? [...prev, id] : prev.filter(x => x !== id));
  };

  const handleSelectAll = (sel: boolean) => {
    if (sel) {
      const filtered = scheduledMessages.filter(m => {
        const matchSearch = m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.students?.phone.includes(searchTerm);
        const matchStudent = selectedStudents.length === 0 || selectedStudents.includes(m.student_id);
        return matchSearch && matchStudent;
      });
      setSelectedMessages(filtered.map(m => m.id));
    } else {
      setSelectedMessages([]);
    }
  };

  const filteredCount = getFilteredMessagesCount(scheduledMessages, searchTerm, dateFilter, customDateRange, selectedStudents);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Mensagens Agendadas</h1>
            <p className="text-muted-foreground">Gerencie todas as mensagens programadas</p>
          </div>
        </div>
        <Button onClick={() => navigate('/agendar-mensagem')} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Mensagem
        </Button>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Mensagens Agendadas ({filteredCount})</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduledMessages.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">Nenhuma mensagem agendada ainda.</p>
              <Button onClick={() => navigate('/agendar-mensagem')} variant="outline" className="gap-2">
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

      <Dialog open={!!editingMessage} onOpenChange={(o) => !o && setEditingMessage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Mensagem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Aluno</Label>
              <Select value={editStudent} onValueChange={setEditStudent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name} - {s.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="min-h-24" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data</Label>
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <Label>Horário</Label>
                <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Atualizar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
