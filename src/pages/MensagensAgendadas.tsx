import { useState, useEffect } from "react";
import { Clock, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import MessageFilters from "@/components/agendarmensagem/MessageFilters";
import MessagesList, { getFilteredMessagesCount } from "@/components/agendarmensagem/MessagesList";
import { AgendarMensagemForm } from "@/components/mensagens/AgendarMensagemForm";

interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
  message_type: string;
  created_at: string;
  student_id: string;
  failure_reason?: string | null;
  retry_count?: number | null;
  evaluation_id?: string | null;
  students?: { name: string; phone: string; };
}
interface Student { id: string; name: string; phone: string; }

export default function MensagensAgendadas() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
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
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from("scheduled_messages")
        .select("*, students(name, phone)")
        .neq("status", "sent")
        .order("scheduled_for", { ascending: true }),
      supabase.from("students").select("id, name, phone").order("name").limit(5000),
    ]);
    setMessages(m || []);
    setStudents(s || []);
    setLoading(false);
  };


  const openEdit = (m: ScheduledMessage) => {
    setEditingMessage(m);
    setEditStudent(m.student_id);
    setEditContent(m.content);
    const d = new Date(m.scheduled_for);
    setEditDate(d.toISOString().split("T")[0]);
    setEditTime(d.toTimeString().slice(0, 5));
  };

  const saveEdit = async () => {
    if (!editingMessage) return;
    const dt = new Date(`${editDate}T${editTime}`);
    if (dt <= new Date()) {
      toast({ title: "A data deve ser futura", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("scheduled_messages").update({
      student_id: editStudent, content: editContent.trim(),
      scheduled_for: dt.toISOString(), status: "pending",
    }).eq("id", editingMessage.id);
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Atualizada" });
    setEditingMessage(null);
    fetchAll();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("scheduled_messages").delete().in("id", deleteTarget.ids);
    if (error) return toast({ title: "Erro", variant: "destructive" });
    toast({ title: `${deleteTarget.ids.length} excluída(s)` });
    setSelectedMessages(prev => prev.filter(id => !deleteTarget.ids.includes(id)));
    setDeleteTarget(null);
    fetchAll();
  };

  const handleRetry = async (id: string) => {
    const { error } = await supabase.from("scheduled_messages").update({
      status: "pending",
      scheduled_for: new Date(Date.now() + 60 * 1000).toISOString(),
      retry_count: 0,
      failure_reason: null,
    }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Reenfileirada — próxima tentativa em 1 min" });
    fetchAll();
  };

  const handleSelectAll = (sel: boolean) => {
    if (sel) {
      const filtered = messages.filter(m => {
        const s = m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.students?.phone.includes(searchTerm);
        const u = selectedStudents.length === 0 || selectedStudents.includes(m.student_id);
        return s && u;
      });
      setSelectedMessages(filtered.map(m => m.id));
    } else setSelectedMessages([]);
  };

  const filteredCount = getFilteredMessagesCount(messages, searchTerm, dateFilter, customDateRange, selectedStudents);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg"><Clock className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">Mensagens Agendadas</h1>
          <p className="text-muted-foreground">Fila de envio — pendentes e falhas</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <MessageFilters
            searchTerm={searchTerm} setSearchTerm={setSearchTerm}
            dateFilter={dateFilter} setDateFilter={setDateFilter}
            customDateRange={customDateRange} setCustomDateRange={setCustomDateRange}
            students={students} selectedStudents={selectedStudents} setSelectedStudents={setSelectedStudents}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mensagens ({filteredCount})</CardTitle></CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">Nenhuma mensagem agendada.</p>
              
            </div>
          ) : (
            <MessagesList
              messages={messages}
              searchTerm={searchTerm} dateFilter={dateFilter}
              customDateRange={customDateRange} selectedStudents={selectedStudents}
              selectedMessages={selectedMessages}
              onMessageSelect={(id, sel) => setSelectedMessages(prev => sel ? [...prev, id] : prev.filter(x => x !== id))}
              onSelectAll={handleSelectAll}
              onDeleteSelected={() => setDeleteTarget({ ids: selectedMessages, label: `${selectedMessages.length} mensagens` })}
              onEdit={openEdit}
              onDelete={(id) => setDeleteTarget({ ids: [id], label: "esta mensagem" })}
              onRetry={handleRetry}
            />
          )}
        </CardContent>
      </Card>


      {/* Edit */}
      <Dialog open={!!editingMessage} onOpenChange={(o) => !o && setEditingMessage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar mensagem</DialogTitle></DialogHeader>
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
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <Label>Hora</Label>
                <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} />
              </div>
            </div>
            <Button onClick={saveEdit} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As mensagens serão removidas da fila de envio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
