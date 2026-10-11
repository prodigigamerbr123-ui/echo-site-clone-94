import { useCallback, useEffect, useState } from "react";
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
import { spDate, fmtDateISOSP, fmtTimeSP } from "@/lib/spTime";
import MessageFilters from "@/components/agendarmensagem/MessageFilters";
import MessagesList, { filterScheduledMessages, getFilteredMessagesCount } from "@/components/agendarmensagem/MessagesList";

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
  recurrence_parent_id?: string | null;
  dispatch_started_at?: string | null;
  students?: { name: string; phone: string };
}
interface Student { id: string; name: string; phone: string; }

interface Props {
  statusFilter: "pending" | "failed" | "processing" | "cancelled";
  emptyLabel?: string;
}

export default function ScheduledList({ statusFilter, emptyLabel }: Props) {
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
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string; wholeSeries?: boolean } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [messagesResult, studentsResult] = await Promise.all([
      supabase.from("scheduled_messages")
        .select("*, students(name, phone)")
        .eq("status", statusFilter)
        .order("scheduled_for", { ascending: true }),
      supabase.from("students").select("id, name, phone").order("name").limit(5000),
    ]);

    const loadError = messagesResult.error || studentsResult.error;
    if (loadError) {
      toast({
        title: "Erro ao carregar mensagens",
        description: loadError.message,
        variant: "destructive",
      });
    }

    setMessages(messagesResult.data || []);
    setStudents(studentsResult.data || []);
    setLoading(false);
  }, [statusFilter, toast]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const openEdit = (m: ScheduledMessage) => {
    if (m.evaluation_id) {
      toast({ title: "Edite pela agenda", description: "Os lembretes vinculados são atualizados junto com a avaliação." });
      return;
    }
    if (m.dispatch_started_at || m.status === "processing" || m.status === "cancelled") {
      toast({ title: "Mensagem não pode ser editada", description: "O envio já começou ou foi cancelado." });
      return;
    }
    setEditingMessage(m);
    setEditStudent(m.student_id);
    setEditContent(m.content);
    const d = new Date(m.scheduled_for);
    setEditDate(fmtDateISOSP(d));
    setEditTime(fmtTimeSP(d));
  };

  const saveEdit = async () => {
    if (!editingMessage) return;
    const [y, mo, day] = editDate.split("-").map(Number);
    const [hh, mi] = (editTime || "00:00").split(":").map(Number);
    const dt = spDate(y, (mo || 1) - 1, day || 1, hh || 0, mi || 0);
    if (!Number.isFinite(dt.getTime()) || dt <= new Date() || !editContent.trim() || !editStudent) return toast({ title: "A data deve ser futura", variant: "destructive" });
    setSaving(true);
    const { data: updated, error } = await supabase.from("scheduled_messages").update({
      student_id: editStudent, content: editContent.trim(),
      scheduled_for: dt.toISOString(), status: "pending",
    }).eq("id", editingMessage.id).eq("status", editingMessage.status).is("dispatch_started_at", null).select("id").maybeSingle();
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    if (!updated) return toast({ title: "A mensagem mudou", description: "Atualize a lista antes de editar.", variant: "destructive" });
    toast({ title: "Atualizada" });
    setEditingMessage(null);
    fetchAll();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase.rpc("cancel_scheduled_messages_tx", { _ids: deleteTarget.ids, _whole_series: deleteTarget.wholeSeries ?? false });
    if (error) return toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    const result = data as { cancelled: number; in_flight: number };
    toast({ title: `${result.cancelled} cancelada(s)`, description: result.in_flight ? "Há envio já iniciado; ele pode chegar ao aluno. Confira no WhatsApp." : "O histórico foi preservado." });
    setSelectedMessages(prev => prev.filter(id => !deleteTarget.ids.includes(id)));
    setDeleteTarget(null);
    fetchAll();
  };

  const handleRetry = async (id: string) => {
    if (messages.find((m) => m.id === id)?.dispatch_started_at) {
      toast({ title: "Confira no WhatsApp", description: "A entrega é incerta. Depois de conferir, componha um novo envio manual se necessário.", variant: "destructive" });
      return;
    }
    const { data: retried, error } = await supabase.from("scheduled_messages").update({
      status: "pending",
      scheduled_for: new Date(Date.now() + 60 * 1000).toISOString(),
      retry_count: 0,
      failure_reason: null,
    }).eq("id", id).eq("status", "failed").is("dispatch_started_at", null).select("id").maybeSingle();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    if (!retried) return toast({ title: "A mensagem mudou", description: "Atualize a lista antes de reenviar.", variant: "destructive" });
    toast({ title: "Reenfileirada — próxima tentativa em 1 min" });
    fetchAll();
  };

  const handleSelectAll = (sel: boolean) => {
    if (sel) {
      const filtered = filterScheduledMessages(
        messages,
        searchTerm,
        dateFilter,
        customDateRange,
        selectedStudents,
      );
      setSelectedMessages(filtered.map(m => m.id));
    } else setSelectedMessages([]);
  };

  const filteredCount = getFilteredMessagesCount(messages, searchTerm, dateFilter, customDateRange, selectedStudents);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
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
              <p className="text-muted-foreground mb-4">{emptyLabel ?? "Nenhuma mensagem."}</p>
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
              onCancelSeries={(id) => setDeleteTarget({ ids: [id], label: "toda a série", wholeSeries: true })}
            />
          )}
        </CardContent>
      </Card>

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
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={fmtDateISOSP(new Date())} />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens ainda não enviadas serão canceladas. Envios já iniciados podem chegar ao aluno. O histórico será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancelar envios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
