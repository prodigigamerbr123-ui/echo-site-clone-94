import { MessageRecipientPicker } from "@/components/mensagens/MessageRecipientPicker";
import { MessageReviewDialog } from "@/components/mensagens/MessageReviewDialog";
import { MessageQueueResult, type ConfirmedMessageOperation } from "@/components/mensagens/MessageQueueResult";
import { buildMessageReview, reviewRecipientsUnchanged, type MessageReview } from "@/lib/messageReview";
import type { MessageSchedule } from "@/lib/messageSchedule";
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
import { matchesStudentSearch } from "@/lib/studentSearch";
import { usePageTitle } from "@/hooks/usePageTitle";
import { enqueueMessages } from "@/lib/messageQueue";
import { errorMessage } from "@/lib/errorMessage";
import { isInactiveRecipient, toggleVisibleRecipients } from "@/lib/messageRecipients";
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
  const confirmationAttempted = useRef(false);
  const [review, setReview] = useState<MessageReview | null>(null);
  const [confirmedOperation, setConfirmedOperation] = useState<ConfirmedMessageOperation | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const appliedPreselection = useRef<string | null>(null);
  // Inativos ficam fora da lista padrão; o dono inclui de propósito para uma campanha de retorno.
  const [showInactive, setShowInactive] = useState(false);

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
    if (!preselectedId) { appliedPreselection.current = null; return; }
    if (appliedPreselection.current === preselectedId) return;
    const preselected = students.find((student) => student.id === preselectedId && student.messages_enabled !== false);
    if (preselected) {
      appliedPreselection.current = preselectedId;
      if (isInactiveRecipient(preselected)) setShowInactive(true);
      setSelectedStudents([preselectedId]);
    }
  }, [students, preselectedId]);

  useEffect(() => {
    setSelectedStudents(previous => previous.filter(id => students.some(student => student.id === id && student.messages_enabled !== false)));
  }, [students]);

  const inactiveCount = students.filter(isInactiveRecipient).length;
  const filteredStudents = students.filter(student => (showInactive || !isInactiveRecipient(student)) && matchesStudentSearch(student, searchTerm));
  const handleShowInactive = (next: boolean) => {
    setShowInactive(next);
    // Ao esconder inativos, nenhum deles pode continuar selecionado fora da vista.
    if (!next) setSelectedStudents(previous => previous.filter(id => !students.some(student => student.id === id && isInactiveRecipient(student))));
  };

  const handleStudentToggle = (id: string) => {
    if (!students.some(student => student.id === id && student.messages_enabled !== false)) return;
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const eligibleVisible = filteredStudents.filter(student => student.messages_enabled !== false);

  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every((student) => selectedStudents.includes(student.id));
  const handleSelectAll = () =>
    setSelectedStudents((previous) => toggleVisibleRecipients(previous, eligibleVisible.map((student) => student.id)));

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

  const enqueue = async () => {
    if (!review || submitting.current) return;
    submitting.current = true;
    setSending(true);
    setReviewError(null);
    try {
      if (!reviewRecipientsUnchanged(review, students)) throw new Error("Os dados de um destinatário mudaram. Volte e confira novamente antes de confirmar.");
      // A scheduled time can expire while its review is open.
      // On a retry the original transaction may already have committed. Let the
      // server replay its request ID even if the scheduled time has since passed.
      if (!confirmationAttempted.current) buildMessageReview(review.recipients, review.message, review.schedule);
      confirmationAttempted.current = true;
      const result = await enqueueMessages(review.recipients.map(student => student.id), review.message, review.schedule, "composer");
      setConfirmedOperation({ queued: result.queued, replayed: result.replayed, review });
      setReview(null);
      resetForm();
    } catch (error: unknown) {
      setReviewError(`${errorMessage(error)}${confirmationAttempted.current ? " Se a conexão foi interrompida, confira a Caixa de saída antes de criar outro envio. Tentar confirmar novamente mantém os mesmos dados da tentativa." : ""}`);
    } finally {
      submitting.current = false;
      setSending(false);
    }
  };

  const resetForm = () => {
    setMessage("");
    setSelectedStudents([]);
    setSelectedPredefined("");
    setQuick({ days7: false, days21: false, days45: false });
    setQuickRepeat(false);
    setQuickWhen("today");
    setQuickTime("10:00");
    setSchedType("quick");
    setCustomDate("");
    setCustomTime("");
    setRecurrence(false);
    setIntervals([{ id: crypto.randomUUID(), days: 7, count: 4 }]);
  };

  const handleAction = () => {
    try {
      const selected = students.filter(student => selectedStudents.includes(student.id));
      if (selected.length !== selectedStudents.length) throw new Error("Atualize a seleção de alunos");
      const schedule: MessageSchedule = mode === "now" ? { kind: "now" } : schedType === "quick"
        ? { kind: "quick", when: quickWhen, repeat: quickRepeat, days: quick, time: quickTime }
        : { kind: "custom", date: customDate, time: customTime, intervals: recurrence ? intervals.map(({ days, count }) => ({ days, count })) : [] };
      setReview(buildMessageReview(selected, message, schedule));
      confirmationAttempted.current = false;
      setReviewError(null);
    } catch (error) {
      toast({ title: "Confira o envio", description: errorMessage(error), variant: "destructive" });
    }
  };

  if (confirmedOperation) {
    return <MessageQueueResult operation={confirmedOperation} onNewMessage={() => {
      resetForm();
      setSearchTerm("");
      setConfirmedOperation(null);
    }} />;
  }

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

      {students.some(student => student.id === preselectedId && student.messages_enabled === false) && <p role="status" className="rounded-md border p-3 text-sm">Este aluno está com mensagens desativadas. Altere a preferência na ficha somente se ele voltar a permitir contato.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MessageRecipientPicker
          filteredStudents={filteredStudents}
          selectedStudents={selectedStudents}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          allVisibleSelected={allVisibleSelected}
          handleSelectAll={handleSelectAll}
          handleStudentToggle={handleStudentToggle}
          inactiveCount={inactiveCount}
          showInactive={showInactive}
          setShowInactive={handleShowInactive}
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
                    ? `Conferir envio (${selectedStudents.length})`
                    : `Conferir agendamento (${selectedStudents.length})`)}
            </Button>
          </CardContent>
        </Card>
      </div>

      {review && <MessageReviewDialog review={review} saving={sending} error={reviewError}
        onBack={() => { if (!submitting.current) { setReview(null); setReviewError(null); } }} onConfirm={() => void enqueue()} />}

    </div>
  );
}
