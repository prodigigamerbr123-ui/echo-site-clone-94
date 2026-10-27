import { useAgendaClock } from "@/hooks/useAgendaClock";
import MessageFilters from "@/components/agendarmensagem/MessageFilters";
import MessagesList from "@/components/agendarmensagem/MessagesList";
import { filterScheduledMessages, getFilteredMessagesCount } from "@/components/agendarmensagem/scheduledMessageFilters";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { errorMessage } from "@/lib/errorMessage";
import { hasUncertainDelivery, UNCERTAIN_DELIVERY_FILTER } from "@/lib/messageDeliveryState";
import { fmtDateISOSP, fmtTimeSP, spDate } from "@/lib/spTime";
import { Clock, Filter } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
interface Student { id: string; name: string; phone: string; messages_enabled?: boolean; }

interface Props {
  statusFilter: "pending" | "failed" | "processing" | "cancelled" | "uncertain";
  emptyLabel?: string;
}

export default function ScheduledList({ statusFilter, emptyLabel }: Props) {
  useAgendaClock();
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
  const busy = useRef(false);
  const requestVersion = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string; wholeSeries?: boolean } | null>(null);
  const [dismissIds, setDismissIds] = useState<string[] | null>(null);

  const fetchAll = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError(false);
    try {
      const [loadedMessages, loadedStudents] = await Promise.all([
        fetchAllPages((from, to) => {
          const query = supabase.from("scheduled_messages").select("*, students(name, phone)", { count: "exact" });
          const filtered = statusFilter === "uncertain" ? query.or(UNCERTAIN_DELIVERY_FILTER) : query.eq("status", statusFilter);
          return filtered.order("scheduled_for", { ascending: true }).order("id").range(from, to);
        }),
        fetchAllPages((from, to) => supabase.from("students")
          .select("id, name, phone, messages_enabled", { count: "exact" }).order("name").order("id").range(from, to)),
      ]);
      if (version !== requestVersion.current) return;
      setMessages(loadedMessages);
      setStudents(loadedStudents);
      setSelectedMessages([]);
    } catch {
      if (version !== requestVersion.current) return;
      setLoadError(true);
      setMessages([]);
      setStudents([]);
      setSelectedMessages([]);
      toast({ title: "Erro ao carregar mensagens", description: "Não foi possível carregar a lista completa. Atualize a página para tentar novamente.", variant: "destructive" });
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    const version = requestVersion;
    void fetchAll();
    return () => { version.current++; };
  }, [fetchAll]);

  const mutate = async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      const description = errorMessage(error);
      setActionError(description);
      toast({ title: "Não foi possível confirmar a operação", description, variant: "destructive" });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const openEdit = (m: ScheduledMessage) => {
    if (busy.current) return;
    setActionError(null);
    if (m.evaluation_id) {
      toast({ title: "Edite pela agenda", description: "Os lembretes vinculados são atualizados junto com a avaliação." });
      return;
    }
    if (m.dispatch_started_at || !["pending", "failed"].includes(m.status)) {
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
    if (students.find(student => student.id === editStudent)?.messages_enabled === false) return toast({ title: "Mensagens desativadas para este aluno", description: "Confira a preferência na ficha antes de preparar um envio.", variant: "destructive" });
    await mutate(async () => {
      const { data: updated, error } = await supabase.from("scheduled_messages").update({
        student_id: editStudent, content: editContent.trim(),
        scheduled_for: dt.toISOString(), status: "pending",
      }).eq("id", editingMessage.id).eq("status", editingMessage.status).is("dispatch_started_at", null).select("id,status").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("A mensagem mudou. Atualize a lista antes de editar.");
      if (updated.status === "cancelled") throw new Error("Envio cancelado: o aluno está com mensagens desativadas. Atualize a lista.");
      toast({ title: "Atualizada" });
      setEditingMessage(null);
      await fetchAll();
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await mutate(async () => {
      const { data, error } = await supabase.rpc("cancel_scheduled_messages_tx", { _ids: deleteTarget.ids, _whole_series: deleteTarget.wholeSeries ?? false });
      if (error) throw error;
      const result = data as { cancelled: number; in_flight: number };
      if (!result || typeof result.cancelled !== "number" || typeof result.in_flight !== "number") {
        throw new Error("O servidor não confirmou o cancelamento. Atualize a lista para conferir.");
      }
      toast({ title: `${result.cancelled} cancelada(s)`, description: result.in_flight ? "Há envio já iniciado; ele pode chegar ao aluno. Confira no WhatsApp." : "O histórico foi preservado." });
      setSelectedMessages(prev => prev.filter(id => !deleteTarget.ids.includes(id)));
      setDeleteTarget(null);
      await fetchAll();
    });
  };

  // Baixa de falhas já revisadas: saem da contagem de pendências sem enviar nada.
  const confirmDismiss = async () => {
    if (!dismissIds) return;
    await mutate(async () => {
      const { data, error } = await supabase.rpc("dismiss_failed_messages_tx", { _ids: dismissIds });
      if (error) throw error;
      const result = data as { dismissed: number } | null;
      if (!result || typeof result.dismissed !== "number") throw new Error("O servidor não confirmou a baixa. Atualize a lista para conferir.");
      toast({ title: `${result.dismissed} falha(s) marcada(s) como revisada(s)`, description: "Nada foi enviado. O motivo original fica na aba Canceladas." });
      setDismissIds(null);
      await fetchAll();
    });
  };

  const handleRetry = async (id: string) => {
    const target = messages.find(message => message.id === id);
    if (students.find(student => student.id === target?.student_id)?.messages_enabled === false) {
      toast({ title: "Mensagens desativadas para este aluno", description: "A tentativa anterior foi preservada. Confira a preferência na ficha.", variant: "destructive" });
      return;
    }
    if (messages.find((m) => m.id === id)?.dispatch_started_at) {
      toast({ title: "Confira no WhatsApp", description: "A entrega é incerta. Depois de conferir, componha um novo envio manual se necessário.", variant: "destructive" });
      return;
    }
    await mutate(async () => {
      const { data: retried, error } = await supabase.from("scheduled_messages").update({
        status: "pending",
        scheduled_for: new Date(Date.now() + 60 * 1000).toISOString(),
        retry_count: 0,
        failure_reason: null,
      }).eq("id", id).eq("status", "failed").is("dispatch_started_at", null).select("id,status").maybeSingle();
      if (error) throw error;
      if (!retried) throw new Error("A mensagem mudou. Atualize a lista antes de reenviar.");
      if (retried.status === "cancelled") throw new Error("Envio cancelado: o aluno está com mensagens desativadas. Atualize a lista.");
      toast({ title: "Reenfileirada — próxima tentativa em 1 min" });
      await fetchAll();
    });
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
      setSelectedMessages(filtered.filter(m => !hasUncertainDelivery(m) && !m.dispatch_started_at && ["pending", "failed", "processing"].includes(m.status)).map(m => m.id));
    } else setSelectedMessages([]);
  };

  const filteredCount = getFilteredMessagesCount(messages, searchTerm, dateFilter, customDateRange, selectedStudents);
  const dismissable = statusFilter === "failed"
    ? filterScheduledMessages(messages, searchTerm, dateFilter, customDateRange, selectedStudents).filter(m => m.status === "failed" && !m.dispatch_started_at)
    : [];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }
  if (loadError) {
    return <div role="alert" className="space-y-3">
      <p>Não foi possível carregar as mensagens. A lista não está confirmada como vazia.</p>
      <Button onClick={() => void fetchAll()}>Tentar novamente</Button>
    </div>;
  }

  return (
    <div className="space-y-6">
      {actionError && !editingMessage && <p role="alert" className="text-destructive">{actionError}</p>}
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle>Mensagens ({filteredCount})</CardTitle><div className="flex flex-wrap gap-2">{dismissable.length > 0 && <Button variant="outline" size="sm" disabled={saving || !!editingMessage} onClick={() => setDismissIds(dismissable.map(m => m.id))}>Marcar como revisadas ({dismissable.length})</Button>}<Button variant="outline" size="sm" disabled={saving || !!editingMessage} onClick={() => void fetchAll()}>Atualizar lista</Button></div></CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">{emptyLabel ?? "Nenhuma mensagem."}</p>
            </div>
          ) : (
            <fieldset disabled={saving} aria-busy={saving}>
            <MessagesList
              readOnly={statusFilter === "uncertain"}
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
            </fieldset>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingMessage} onOpenChange={(o) => { if (!o && !busy.current) setEditingMessage(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar mensagem</DialogTitle></DialogHeader>
          <fieldset disabled={saving} className="space-y-4">
            <div>
              <Label htmlFor="scheduled-student">Aluno</Label>
              <Select value={editStudent} onValueChange={setEditStudent}>
                <SelectTrigger id="scheduled-student"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name} - {s.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="scheduled-content">Mensagem</Label>
              <Textarea id="scheduled-content" value={editContent} onChange={e => setEditContent(e.target.value)} className="min-h-24" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheduled-date">Data</Label>
                <Input id="scheduled-date" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={fmtDateISOSP(new Date())} />
              </div>
              <div>
                <Label htmlFor="scheduled-time">Hora</Label>
                <Input id="scheduled-time" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} />
              </div>
            </div>
            {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
            <Button onClick={saveEdit} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </fieldset>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!dismissIds} onOpenChange={(o) => { if (!o && !busy.current) setDismissIds(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar {dismissIds?.length} falha(s) como revisada(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Use depois de conferir os motivos. Nada será enviado: as mensagens saem das pendências do Início e ficam na aba Canceladas com o motivo original. Para tentar de novo, use Reenviar antes de dar baixa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
            <AlertDialogCancel disabled={saving}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void confirmDismiss(); }}>
              Marcar como revisadas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !busy.current) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens ainda não enviadas serão canceladas. Envios já iniciados podem chegar ao aluno. O histórico será preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void confirmDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancelar envios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
