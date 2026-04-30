import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Student { id: string; name: string; phone: string; }
interface PredefinedMessage { id: string; title: string; content: string; }

export default function AgendarMensagem() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedPredefinedMessage, setSelectedPredefinedMessage] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [schedulingMode, setSchedulingMode] = useState<'quick' | 'custom'>('quick');
  const [quickScheduleOptions, setQuickScheduleOptions] = useState({ today: false, days7: false, days21: false, days45: false });
  const [quickScheduleTime, setQuickScheduleTime] = useState("10:00");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('students').select('id, name, phone').order('name');
      setStudents(s || []);
      const { data: p } = await supabase.from('predefined_messages').select('id, title, content').order('title');
      setPredefinedMessages(p || []);
    })();
  }, []);

  const handlePredefinedSelect = (id: string) => {
    setSelectedPredefinedMessage(id);
    const m = predefinedMessages.find(x => x.id === id);
    if (m) setMessageContent(m.content);
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
        const d = new Date(`${scheduledDate}T${scheduledTime}`);
        if (d <= new Date()) {
          toast({ title: "Atenção", description: "A data deve ser futura.", variant: "destructive" });
          setSaving(false);
          return;
        }
        messages.push({ student_id: selectedStudent, content: messageContent.trim(), scheduled_for: d.toISOString(), message_type: 'manual', status: 'pending' });
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
          <div>
            <Label>Aluno</Label>
            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
              <SelectTrigger><SelectValue placeholder="Selecione um aluno" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name} - {s.phone}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Mensagem Pré-definida (Opcional)</Label>
            <Select value={selectedPredefinedMessage} onValueChange={handlePredefinedSelect}>
              <SelectTrigger><SelectValue placeholder="Escolha uma mensagem" /></SelectTrigger>
              <SelectContent>
                {predefinedMessages.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
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
