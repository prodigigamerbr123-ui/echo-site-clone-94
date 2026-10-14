import { MessageRecipientPicker } from "@/components/mensagens/MessageRecipientPicker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import { useToast } from "@/hooks/use-toast";
import { useMessageComposerData } from "@/hooks/useMessageComposerData";
import { usePageTitle } from "@/hooks/usePageTitle";
import { enqueueMessages } from "@/lib/messageQueue";
import { errorMessage } from "@/lib/errorMessage";
import { toggleVisibleRecipients } from "@/lib/messageRecipients";
import { hasNameVar } from "@/lib/phone";
import { deliverySpread } from "@/lib/messageSchedule";
import { fmtDateISOSP } from "@/lib/spTime";
import { CalendarClock, MessageSquare, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

interface Interval { id: string; days: number; count: number; }

type Mode = "now" | "schedule";
type QuickWhen = "today" | "later";

export default function Mensagens() {
  usePageTitle("Mensagens");
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { students, predefinedMessages, loading, loadError, refetch } = useMessageComposerData();
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPredefined, setSelectedPredefined] = useState("");
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The URL is the source of truth, including links opened from the dashboard.
  const mode: Mode = searchParams.get("tab") === "agendar" ? "schedule" : "now";
  const setMode = (next: Mode) => {
    setSearchParams(previous => {
      const params = new URLSearchParams(previous);
      params.set("tab", next === "schedule" ? "agendar" : "agora");
      return params;
    });
  };

  // Schedule state
  const [schedType, setSchedType] = useState<"quick" | "custom">("quick");
  const [quickWhen, setQuickWhen] = useState<QuickWhen>("today");
  const [quickRepeat, setQuickRepeat] = useState(false);
  const [quick, setQuick] = useState({ days7: false, days21: false, days45: false });
  const [quickTime, setQuickTime] = useState("10:00");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [recurrence, setRecurrence] = useState(false);
  const [intervals, setIntervals] = useState<Interval[]>([{ id: crypto.randomUUID(), days: 7, count: 4 }]);

  const preselectedId = searchParams.get("aluno");
  useEffect(() => {
    if (preselectedId && students.some((student) => student.id === preselectedId)) {
      setSelectedStudents([preselectedId]);
    }
  }, [students, preselectedId]);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)
  );

  const handleStudentToggle = (id: string) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every((student) => selectedStudents.includes(student.id));
  const handleSelectAll = () =>
    setSelectedStudents((previous) => toggleVisibleRecipients(previous, filteredStudents.map((student) => student.id)));

  const handlePredefinedSelect = (id: string) => {
    const m = predefinedMessages.find(x => x.id === id);
    if (m) { setMessage(m.content); setSelectedPredefined(id); }
  };

  const insertNameVar = () =>
    setMessage(prev => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + "{nome}");

  const spreadInfo = deliverySpread(selectedStudents.length);

  const previewName = useMemo(() => {
    if (selectedStudents.length === 1) return students.find(s => s.id === selectedStudents[0])?.name;
    return undefined;
  }, [selectedStudents, students]);

  const enqueue = async (immediate: boolean) => {
    // React state updates are asynchronous; guard clicks in the same render too.
    if (submitting.current) return;
    submitting.current = true;
    setSending(true);
    try {
      const selected = students.filter(student => selectedStudents.includes(student.id));
      if (selected.length !== selectedStudents.length) throw new Error("Atualize a seleção de alunos");
      const schedule = immediate ? { kind: "now" as const } : schedType === "quick"
        ? { kind: "quick" as const, when: quickWhen, repeat: quickRepeat, days: quick, time: quickTime }
        : { kind: "custom" as const, date: customDate, time: customTime, intervals: recurrence ? intervals : [] };
      const result = await enqueueMessages(selected.map(student => student.id), message, schedule, "composer");
      toast({
        title: immediate ? `${result.queued} mensagem(ns) na fila` : `${result.queued} mensagem(ns) agendada(s)`,
        description: immediate ? (spreadInfo.spread
          ? `Serão enviadas de forma gradual ao longo de ~${spreadInfo.minutes} min.`
          : "Serão enviadas nos próximos minutos.") : undefined,
      });
      resetForm();
    } catch (error: unknown) {
      toast({ title: "Erro", description: errorMessage(error), variant: "destructive" });
    } finally {
      submitting.current = false;
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const resetForm = () => {
    setMessage("");
    setSelectedStudents([]);
    setSelectedPredefined("");
    setQuick({ days7: false, days21: false, days45: false });
    setQuickRepeat(false);
    setCustomDate("");
    setCustomTime("");
    setRecurrence(false);
  };

  const handleAction = () => {
    if (!message.trim()) return toast({ title: "Digite uma mensagem", variant: "destructive" });
    if (selectedStudents.length === 0) return toast({ title: "Selecione pelo menos um aluno", variant: "destructive" });
    if (mode === "now") {
      if (selectedStudents.length > 100) { setConfirmOpen(true); return; }
      enqueue(true);
    } else {
      enqueue(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (loadError) {
    return (
      <Card><CardContent className="pt-6" role="alert">
        <p>Não foi possível carregar os alunos e modelos de mensagem.</p>
        <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Send className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mensagens</h1>
          <p className="text-muted-foreground">Envie agora ou agende para os alunos selecionados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MessageRecipientPicker
          filteredStudents={filteredStudents}
          selectedStudents={selectedStudents}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          allVisibleSelected={allVisibleSelected}
          handleSelectAll={handleSelectAll}
          handleStudentToggle={handleStudentToggle}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Compor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "now" ? "default" : "outline"}
                onClick={() => setMode("now")}
              >
                <Send className="h-4 w-4 mr-2" /> Enviar agora
              </Button>
              <Button
                type="button"
                variant={mode === "schedule" ? "default" : "outline"}
                onClick={() => setMode("schedule")}
              >
                <CalendarClock className="h-4 w-4 mr-2" /> Agendar
              </Button>
            </div>

            <div>
              <Label htmlFor="cm-predefined" className="text-sm font-medium mb-2 block">Pré-definidas</Label>
              <Select value={selectedPredefined} onValueChange={handlePredefinedSelect}>
                <SelectTrigger id="cm-predefined"><SelectValue placeholder="Escolha uma mensagem" /></SelectTrigger>
                <SelectContent>
                  {predefinedMessages.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="cm-message" className="text-sm font-medium">Conteúdo</Label>
                <Button type="button" variant="ghost" size="sm" onClick={insertNameVar} aria-label="Inserir variável nome">
                  + Inserir {"{nome}"}
                </Button>
              </div>
              <Textarea
                id="cm-message"
                placeholder="Digite a mensagem..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="min-h-32"
                maxLength={1000}
              />
              <p className="text-xs text-foreground/80 mt-1">
                {message.length}/1000 • Use <code>{"{nome}"}</code> para personalizar
              </p>
            </div>

            <WhatsAppPreview content={message} studentName={previewName} />

            {mode === "schedule" && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex gap-2">
                  <Button type="button" variant={schedType === "quick" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setSchedType("quick")}>Rápido</Button>
                  <Button type="button" variant={schedType === "custom" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setSchedType("custom")}>Personalizado</Button>
                </div>

                {schedType === "quick" ? (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm">Quando enviar?</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <Button type="button" variant={quickWhen === "today" ? "default" : "outline"} size="sm" onClick={() => setQuickWhen("today")}>Hoje</Button>
                        <Button type="button" variant={quickWhen === "later" ? "default" : "outline"} size="sm" onClick={() => setQuickWhen("later")}>Daqui alguns dias</Button>
                      </div>
                    </div>

                    {quickWhen === "today" && (
                      <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
                        <Checkbox checked={quickRepeat} onCheckedChange={v => setQuickRepeat(!!v)} className="mt-0.5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">Quer que a mensagem se repita?</div>
                          <div className="text-xs text-foreground/80">Reenvia automaticamente daqui a 7, 21 ou 45 dias</div>
                        </div>
                      </label>
                    )}

                    {(quickWhen === "later" || quickRepeat) && (
                      <div>
                        <Label className="text-sm">{quickWhen === "later" ? "Enviar daqui a:" : "Repetir daqui a:"}</Label>
                        <p className="text-xs text-foreground/80 mb-2">Selecione um ou mais períodos</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ["days7", 7, "7 dias"],
                            ["days21", 21, "21 dias"],
                            ["days45", 45, "45 dias"],
                          ] as const).map(([k, d, label]) => (
                            <label
                              key={k}
                              className={`flex flex-col items-center gap-1 rounded-md border p-3 cursor-pointer transition-colors ${
                                quick[k] ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                              }`}
                            >
                              <Checkbox checked={quick[k]} onCheckedChange={v => setQuick(prev => ({ ...prev, [k]: !!v }))} />
                              <span className="text-sm font-medium">+{d}d</span>
                              <span className="text-xs text-foreground/80">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="cm-quick-time">Horário de envio</Label>
                      <Input id="cm-quick-time" type="time" value={quickTime} onChange={e => setQuickTime(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="cm-date">Data</Label>
                        <Input id="cm-date" type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} min={fmtDateISOSP(new Date())} />
                      </div>
                      <div>
                        <Label htmlFor="cm-time">Horário</Label>
                        <Input id="cm-time" type="time" value={customTime} onChange={e => setCustomTime(e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={recurrence} onCheckedChange={v => setRecurrence(!!v)} />
                      Recorrência
                    </label>
                    {recurrence && (
                      <div className="space-y-2 pl-4 border-l-2">
                        {intervals.map(it => (
                          <div key={it.id} className="flex gap-2 items-end">
                            <div className="flex-1">
                              <Label htmlFor={`cm-int-days-${it.id}`} className="text-xs">A cada (dias)</Label>
                              <Input id={`cm-int-days-${it.id}`} type="number" min={1} value={it.days} onChange={e => setIntervals(prev => prev.map(x => x.id === it.id ? { ...x, days: +e.target.value } : x))} />
                            </div>
                            <div className="flex-1">
                              <Label htmlFor={`cm-int-count-${it.id}`} className="text-xs">Quantas vezes</Label>
                              <Input id={`cm-int-count-${it.id}`} type="number" min={1} value={it.count} onChange={e => setIntervals(prev => prev.map(x => x.id === it.id ? { ...x, count: +e.target.value } : x))} />
                            </div>
                            {intervals.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setIntervals(prev => prev.filter(x => x.id !== it.id))} aria-label="Remover intervalo">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setIntervals(prev => [...prev, { id: crypto.randomUUID(), days: 7, count: 4 }])}>
                          <Plus className="h-3 w-3 mr-1" /> Adicionar intervalo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === "now" && spreadInfo.spread && (
              <p className="text-xs text-muted-foreground">
                ⏱ {selectedStudents.length} alunos → distribuído ao longo de ~{spreadInfo.minutes} minutos
                {hasNameVar(message) && " • {nome} substituído por aluno"}
              </p>
            )}

            <Button
              onClick={handleAction}
              disabled={sending || !message.trim() || selectedStudents.length === 0}
              className="w-full"
            >
              {mode === "now" ? <Send className="h-4 w-4 mr-2" /> : <CalendarClock className="h-4 w-4 mr-2" />}
              {sending
                ? (mode === "now" ? "Enfileirando..." : "Agendando...")
                : (mode === "now"
                    ? `Enfileirar envio (${selectedStudents.length})`
                    : `Agendar para ${selectedStudents.length} aluno(s)`)}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a enviar para <strong>{selectedStudents.length} alunos</strong>.
              As mensagens serão distribuídas ao longo de <strong>~{spreadInfo.minutes} minutos</strong>{" "}
              (~{Math.ceil(spreadInfo.minutes / 60)}h) para não ser bloqueado pelo WhatsApp.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void enqueue(true)}>Enviar para {selectedStudents.length}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
