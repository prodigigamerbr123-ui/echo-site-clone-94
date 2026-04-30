import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Student { id: string; name: string; phone: string; }
interface PredefinedMessage { id: string; title: string; content: string; }
interface RecurrenceInterval { id: string; days: number; count: number; }

export default function AgendarMensagem() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [selectedPredefinedMessage, setSelectedPredefinedMessage] = useState("");
  const [predefinedOpen, setPredefinedOpen] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [schedulingMode, setSchedulingMode] = useState<'quick' | 'custom'>('quick');
  const [quickScheduleOptions, setQuickScheduleOptions] = useState({ today: false, days7: false, days21: false, days45: false });
  const [quickScheduleTime, setQuickScheduleTime] = useState("10:00");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceIntervals, setRecurrenceIntervals] = useState<RecurrenceInterval[]>([
    { id: crypto.randomUUID(), days: 7, count: 4 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('students').select('id, name, phone').order('name');
      setStudents(s || []);
      const { data: p } = await supabase.from('predefined_messages').select('id, title, content').order('title');
      setPredefinedMessages(p || []);
    })();
  }, []);

  const selectedStudentData = useMemo(() => students.find(s => s.id === selectedStudent), [students, selectedStudent]);
  const selectedPredefinedData = useMemo(() => predefinedMessages.find(m => m.id === selectedPredefinedMessage), [predefinedMessages, selectedPredefinedMessage]);

  const handlePredefinedSelect = (id: string) => {
    setSelectedPredefinedMessage(id);
    const m = predefinedMessages.find(x => x.id === id);
    if (m) setMessageContent(m.content);
    setPredefinedOpen(false);
  };

  const calculateScheduleDates = () => {
    const now = new Date();
    const dates: { date: Date; type: string }[] = [];
    const [h, m] = quickScheduleTime.split(':').map(Number);
    const make = (offsetDays: number, type: string) => {
      const d = new Date(now.getTime() + offsetDays * 86400000);
      d.setHours(h, m, 0, 0);
      if (offsetDays === 0 && d <= now) d.setDate(d.getDate() + 1);
      dates.push({ date: d, type });
    };
    if (quickScheduleOptions.today) make(0, 'today_followup');
    if (quickScheduleOptions.days7) make(7, '7_day_followup');
    if (quickScheduleOptions.days21) make(21, '21_day_followup');
    if (quickScheduleOptions.days45) make(45, '45_day_followup');
    return dates;
  };

  const addInterval = () => {
    setRecurrenceIntervals(prev => [...prev, { id: crypto.randomUUID(), days: 7, count: 4 }]);
  };
  const removeInterval = (id: string) => {
    setRecurrenceIntervals(prev => prev.filter(i => i.id !== id));
  };
  const updateInterval = (id: string, field: 'days' | 'count', value: number) => {
    setRecurrenceIntervals(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSave = async () => {
    if (!selectedStudent || !messageContent.trim()) {
      toast({ title: "Atenção", description: "Preencha aluno e mensagem.", variant: "destructive" });
      return;
    }
    if (schedulingMode === 'quick') {
      const has = Object.values(quickScheduleOptions).some(Boolean);
      if (!has) {
        toast({ title: "Atenção", description: "Selecione pelo menos uma opção.", variant: "destructive" });
        return;
      }
    } else if (!scheduledDate || !scheduledTime) {
      toast({ title: "Atenção", description: "Preencha data e hora.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const messages: any[] = [];
      if (schedulingMode === 'quick') {
        for (const { date, type } of calculateScheduleDates()) {
          messages.push({ student_id: selectedStudent, content: messageContent.trim(), scheduled_for: date.toISOString(), message_type: type, status: 'pending' });
        }
      } else {
        const baseDate = new Date(`${scheduledDate}T${scheduledTime}`);
        if (baseDate <= new Date()) {
          toast({ title: "Atenção", description: "A data deve ser futura.", variant: "destructive" });
          setSaving(false);
          return;
        }
        // Mensagem inicial
        messages.push({ student_id: selectedStudent, content: messageContent.trim(), scheduled_for: baseDate.toISOString(), message_type: 'manual', status: 'pending' });

        // Recorrências (se ativas)
        if (recurrenceEnabled) {
          for (const interval of recurrenceIntervals) {
            if (interval.days <= 0 || interval.count <= 0) continue;
            for (let i = 1; i <= interval.count; i++) {
              const d = new Date(baseDate.getTime() + i * interval.days * 86400000);
              messages.push({
                student_id: selectedStudent,
                content: messageContent.trim(),
                scheduled_for: d.toISOString(),
                message_type: 'recurring',
                status: 'pending',
                recurrence_interval_days: interval.days,
                recurrence_count: interval.count,
              });
            }
          }
        }
      }

      const { error } = await supabase.from('scheduled_messages').insert(messages);
      if (error) throw error;

      toast({ title: "Sucesso!", description: `${messages.length} mensagem(ns) agendada(s). Envio automático ativado.` });
      navigate('/mensagens-agendadas');
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Clock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Agendar Mensagem</h1>
          <p className="text-muted-foreground">Programe uma mensagem para ser enviada automaticamente via WhatsApp</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Nova Mensagem Agendada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Aluno - Combobox */}
          <div>
            <Label>Aluno</Label>
            <Popover open={studentOpen} onOpenChange={setStudentOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedStudentData ? `${selectedStudentData.name} - ${selectedStudentData.phone}` : "Digite para buscar um aluno..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                <Command>
                  <CommandInput placeholder="Buscar aluno..." />
                  <CommandList>
                    <CommandEmpty>Nenhum aluno encontrado.</CommandEmpty>
                    <CommandGroup>
                      {students.map(s => (
                        <CommandItem
                          key={s.id}
                          value={`${s.name} ${s.phone}`}
                          onSelect={() => { setSelectedStudent(s.id); setStudentOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedStudent === s.id ? "opacity-100" : "opacity-0")} />
                          {s.name} - {s.phone}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Mensagem pré-definida - Combobox */}
          <div>
            <Label>Mensagem Pré-definida (Opcional)</Label>
            <Popover open={predefinedOpen} onOpenChange={setPredefinedOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedPredefinedData ? selectedPredefinedData.title : "Digite para buscar uma mensagem..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
                <Command>
                  <CommandInput placeholder="Buscar mensagem..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma mensagem encontrada.</CommandEmpty>
                    <CommandGroup>
                      {predefinedMessages.map(m => (
                        <CommandItem key={m.id} value={m.title} onSelect={() => handlePredefinedSelect(m.id)}>
                          <Check className={cn("mr-2 h-4 w-4", selectedPredefinedMessage === m.id ? "opacity-100" : "opacity-0")} />
                          {m.title}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Conteúdo</Label>
            <Textarea value={messageContent} onChange={e => setMessageContent(e.target.value)} className="min-h-24" maxLength={1000} placeholder="Digite a mensagem..." />
            <p className="text-xs text-muted-foreground mt-1">{messageContent.length}/1000</p>
          </div>

          <div>
            <Label>Tipo de Agendamento</Label>
            <div className="flex gap-4 mt-2">
              <Button type="button" variant={schedulingMode === 'quick' ? 'default' : 'outline'} onClick={() => setSchedulingMode('quick')} className="flex-1">Rápido</Button>
              <Button type="button" variant={schedulingMode === 'custom' ? 'default' : 'outline'} onClick={() => setSchedulingMode('custom')} className="flex-1">Personalizado</Button>
            </div>
          </div>

          {schedulingMode === 'quick' ? (
            <div className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Horário:</Label>
                <Input type="time" value={quickScheduleTime} onChange={e => setQuickScheduleTime(e.target.value)} className="w-32" />
              </div>
              {[
                { key: 'today', label: 'Hoje', days: 0 },
                { key: 'days7', label: 'Daqui a 7 dias', days: 7 },
                { key: 'days21', label: 'Daqui a 21 dias', days: 21 },
                { key: 'days45', label: 'Daqui a 45 dias', days: 45 },
              ].map(opt => (
                <div key={opt.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={opt.key}
                    checked={(quickScheduleOptions as any)[opt.key]}
                    onCheckedChange={(c) => setQuickScheduleOptions(prev => ({ ...prev, [opt.key]: c as boolean }))}
                  />
                  <Label htmlFor={opt.key} className="text-sm">
                    {opt.label} ({new Date(Date.now() + opt.days * 86400000).toLocaleDateString('pt-BR')}) às {quickScheduleTime}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <Label>Horário</Label>
                  <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
                </div>
              </div>

              {/* Recorrência opcional */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recurrence"
                    checked={recurrenceEnabled}
                    onCheckedChange={(c) => setRecurrenceEnabled(c as boolean)}
                  />
                  <Label htmlFor="recurrence" className="text-sm font-medium cursor-pointer">
                    Repetir esta mensagem em intervalos personalizados (opcional)
                  </Label>
                </div>

                {recurrenceEnabled && (
                  <div className="space-y-3 pl-6">
                    <p className="text-xs text-muted-foreground">
                      A mensagem será reenviada após a data inicial. Adicione quantos intervalos quiser.
                    </p>
                    {recurrenceIntervals.map((interval, idx) => (
                      <div key={interval.id} className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">A cada (dias)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={interval.days}
                            onChange={e => updateInterval(interval.id, 'days', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Repetir (vezes)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={interval.count}
                            onChange={e => updateInterval(interval.id, 'count', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        {recurrenceIntervals.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeInterval(interval.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addInterval} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar intervalo
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Salvando..." : "Agendar Mensagem"}
          </Button>

          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm text-foreground">
              <strong>Envio automático:</strong> Mensagens agendadas são enviadas automaticamente via Evolution API no horário programado. O WhatsApp da academia precisa estar conectado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
