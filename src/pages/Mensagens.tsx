import { usePageTitle } from "@/hooks/usePageTitle";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Send, Users, MessageSquare, CalendarClock, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import { hasNameVar, replaceNameVar } from "@/lib/phone";
import { fetchAutomationTemplateIds } from "@/lib/automationTemplateIds";
import { spDate, spParts } from "@/lib/spTime";

interface Student { id: string; name: string; phone: string; had_evaluation: boolean; }
interface PredefinedMessage { id: string; title: string; content: string; }
interface Interval { id: string; days: number; count: number; }

type Mode = "now" | "schedule";
type QuickWhen = "today" | "later";

export default function Mensagens() {
  usePageTitle("Mensagens");
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPredefined, setSelectedPredefined] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Mode
  const [mode, setMode] = useState<Mode>("now");

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

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }, autoIds] = await Promise.all([
        supabase.from("students").select("id, name, phone, had_evaluation").order("name").limit(5000),
        supabase.from("predefined_messages").select("*").order("title"),
        fetchAutomationTemplateIds(),
      ]);
      setStudents(s || []);
      setPredefinedMessages((p || []).filter((m: any) => !autoIds.has(m.id)));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const pre = searchParams.get("aluno");
    if (pre && students.length) setSelectedStudents([pre]);
  }, [students, searchParams]);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)
  );

  const handleStudentToggle = (id: string) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSelectAll = () =>
    setSelectedStudents(selectedStudents.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));

  const handlePredefinedSelect = (id: string) => {
    const m = predefinedMessages.find(x => x.id === id);
    if (m) { setMessage(m.content); setSelectedPredefined(id); }
  };

  const insertNameVar = () =>
    setMessage(prev => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + "{nome}");

  const spreadInfo = useMemo(() => {
    const n = selectedStudents.length;
    if (n <= 5) return { spread: false, minutes: 0 };
    if (n <= 20) return { spread: true, minutes: Math.min(30, n * 2) };
    if (n <= 100) return { spread: true, minutes: 60 };
    return { spread: true, minutes: Math.ceil(n * 0.6) };
  }, [selectedStudents.length]);

  const previewName = useMemo(() => {
    if (selectedStudents.length === 1) return students.find(s => s.id === selectedStudents[0])?.name;
    return undefined;
  }, [selectedStudents, students]);

  const enqueueNow = async () => {
    setSending(true);
    try {
      const selected = students.filter(s => selectedStudents.includes(s.id));
      const now = Date.now();
      const spanMs = spreadInfo.spread ? spreadInfo.minutes * 60 * 1000 : 0;
      const rows = selected.map((s, i) => {
        const startOffset = 60 * 1000 + Math.floor(Math.random() * 2 * 60 * 1000);
        const spreadOffset = selected.length > 1 && spanMs > 0
          ? Math.floor((spanMs / (selected.length - 1)) * i) + Math.floor(Math.random() * 20000)
          : 0;
        return {
          student_id: s.id,
          content: replaceNameVar(message.trim(), s.name),
          scheduled_for: new Date(now + startOffset + spreadOffset).toISOString(),
          message_type: "manual",
          status: "pending",
        };
      });
      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) throw error;
      toast({
        title: `${rows.length} mensagem(ns) na fila`,
        description: spreadInfo.spread
          ? `Serão enviadas de forma gradual ao longo de ~${spreadInfo.minutes} min.`
          : "Serão enviadas nos próximos minutos.",
      });
      resetForm();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const enqueueSchedule = async () => {
    setSending(true);
    try {
      const selected = students.filter(s => selectedStudents.includes(s.id));
      const rows: any[] = [];

      if (schedType === "quick") {
        const [h, m] = quickTime.split(":").map(Number);
        const now = new Date();
        const makeDate = (daysFromNow: number) => {
          const base = new Date(now.getTime() + daysFromNow * 86400000);
          const p = spParts(base);
          return spDate(p.y, p.mo, p.d, h, m);
        };
        for (const stu of selected) {
          const content = replaceNameVar(message.trim(), stu.name);
          if (quickWhen === "today") {
            const dt = makeDate(0);
            if (dt <= now) throw new Error("O horário de hoje já passou");
            rows.push({ student_id: stu.id, content, scheduled_for: dt.toISOString(), message_type: "manual", status: "pending" });
          }
          if (quickWhen === "later" || quickRepeat) {
            const opts: [boolean, number, string][] = [
              [quick.days7, 7, "7_day_followup"],
              [quick.days21, 21, "21_day_followup"],
              [quick.days45, 45, "45_day_followup"],
            ];
            for (const [on, d, type] of opts) {
              if (!on) continue;
              rows.push({ student_id: stu.id, content, scheduled_for: makeDate(d).toISOString(), message_type: type, status: "pending" });
            }
          }
        }
        if (!rows.length) throw new Error("Selecione pelo menos uma opção de envio");
      } else {
        if (!customDate || !customTime) throw new Error("Preencha data e horário");
        const base = new Date(`${customDate}T${customTime}`);
        if (base <= new Date()) throw new Error("Data deve ser futura");
        for (const stu of selected) {
          const content = replaceNameVar(message.trim(), stu.name);
          rows.push({ student_id: stu.id, content, scheduled_for: base.toISOString(), message_type: "manual", status: "pending" });
          if (recurrence) {
            for (const it of intervals) {
              if (it.days <= 0 || it.count <= 0) continue;
              for (let i = 1; i <= it.count; i++) {
                const d = new Date(base.getTime() + i * it.days * 86400000);
                rows.push({
                  student_id: stu.id, content,
                  scheduled_for: d.toISOString(), message_type: "recurring", status: "pending",
                  recurrence_interval_days: it.days, recurrence_count: it.count,
                });
              }
            }
          }
        }
      }

      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) throw error;
      toast({ title: `${rows.length} mensagem(ns) agendada(s)` });
      resetForm();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
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
      enqueueNow();
    } else {
      enqueueSchedule();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
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
              <p className="text-center text-muted-foreground py-8">Nenhum aluno.</p>
            ) : (
              filteredStudents.map(s => (
                <div
                  key={s.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer ${
                    selectedStudents.includes(s.id) ? "bg-accent/50 border-primary/50" : "border-border"
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
                        <Input id="cm-date" type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
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
            <AlertDialogAction onClick={enqueueNow}>Enviar para {selectedStudents.length}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
