import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, ChevronsUpDown } from "lucide-react";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import { replaceNameVar } from "@/lib/phone";

interface Student { id: string; name: string; phone: string; }
interface PredefinedMessage { id: string; title: string; content: string; }
interface Interval { id: string; days: number; count: number; }

interface Props {
  onSaved: () => void;
}

/**
 * Formulário compacto para "Nova mensagem agendada". Usado dentro de um Sheet
 * na página /mensagens-agendadas. Mantém modo Rápido (presets 7/21/45 dias) e
 * Personalizado (data + recorrência opcional).
 */
export function AgendarMensagemForm({ onSaved }: Props) {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [predefined, setPredefined] = useState<PredefinedMessage[]>([]);
  const [studentId, setStudentId] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [quick, setQuick] = useState({ days7: false, days21: false, days45: false });
  const [quickTime, setQuickTime] = useState("10:00");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [recurrence, setRecurrence] = useState(false);
  const [intervals, setIntervals] = useState<Interval[]>([{ id: crypto.randomUUID(), days: 7, count: 4 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("students").select("id, name, phone").order("name").limit(5000);
      setStudents(s || []);
      const { data: p } = await supabase.from("predefined_messages").select("*").order("title");
      setPredefined(p || []);
    })();
  }, []);

  const selected = useMemo(() => students.find(s => s.id === studentId), [students, studentId]);

  const insertName = () => setContent(prev => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + "{nome}");

  const handleSave = async () => {
    if (!studentId || !content.trim()) {
      toast({ title: "Preencha aluno e mensagem", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const rows: any[] = [];
      const finalContent = replaceNameVar(content.trim(), selected?.name ?? "");
      if (mode === "quick") {
        const [h, m] = quickTime.split(":").map(Number);
        const now = new Date();
        const opts: [boolean, number, string][] = [
          [quick.days7, 7, "7_day_followup"],
          [quick.days21, 21, "21_day_followup"],
          [quick.days45, 45, "45_day_followup"],
        ];
        for (const [on, d, type] of opts) {
          if (!on) continue;
          const dt = new Date(now.getTime() + d * 86400000);
          dt.setHours(h, m, 0, 0);
          rows.push({ student_id: studentId, content: finalContent, scheduled_for: dt.toISOString(), message_type: type, status: "pending" });
        }
        if (!rows.length) throw new Error("Selecione pelo menos um preset");
      } else {
        if (!date || !time) throw new Error("Preencha data e horário");
        const base = new Date(`${date}T${time}`);
        if (base <= new Date()) throw new Error("Data deve ser futura");
        rows.push({ student_id: studentId, content: finalContent, scheduled_for: base.toISOString(), message_type: "manual", status: "pending" });
        if (recurrence) {
          for (const it of intervals) {
            if (it.days <= 0 || it.count <= 0) continue;
            for (let i = 1; i <= it.count; i++) {
              const d = new Date(base.getTime() + i * it.days * 86400000);
              rows.push({
                student_id: studentId, content: finalContent,
                scheduled_for: d.toISOString(), message_type: "recurring", status: "pending",
                recurrence_interval_days: it.days, recurrence_count: it.count,
              });
            }
          }
        }
      }
      const { error } = await supabase.from("scheduled_messages").insert(rows);
      if (error) throw error;
      toast({ title: `${rows.length} mensagem(ns) agendada(s)` });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Aluno</Label>
        <Popover open={studentOpen} onOpenChange={setStudentOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-normal">
              {selected ? `${selected.name} - ${selected.phone}` : "Buscar aluno..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar por nome ou telefone..." />
              <CommandList>
                <CommandEmpty>Nenhum aluno</CommandEmpty>
                <CommandGroup>
                  {students.map(s => (
                    <CommandItem key={s.id} value={`${s.name} ${s.phone}`} onSelect={() => { setStudentId(s.id); setStudentOpen(false); }}>
                      {s.name} — {s.phone}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>

            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <Label>Pré-definida (opcional)</Label>
        <Select onValueChange={(id) => {
          const m = predefined.find(x => x.id === id);
          if (m) setContent(m.content);
        }}>
          <SelectTrigger><SelectValue placeholder="Escolher template" /></SelectTrigger>
          <SelectContent>
            {predefined.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Mensagem</Label>
          <Button type="button" variant="ghost" size="sm" onClick={insertName}>+ {"{nome}"}</Button>
        </div>
        <Textarea value={content} onChange={e => setContent(e.target.value)} className="min-h-24" maxLength={1000} />
        <p className="text-xs text-muted-foreground mt-1">Use <code>{"{nome}"}</code> para personalizar</p>
      </div>

      <WhatsAppPreview content={content} studentName={selected?.name} />

      <div className="flex gap-2">
        <Button type="button" variant={mode === "quick" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("quick")}>Rápido</Button>
        <Button type="button" variant={mode === "custom" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMode("custom")}>Personalizado</Button>
      </div>

      {mode === "quick" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {(["days7", "days21", "days45"] as const).map((k, idx) => (
              <label key={k} className="flex items-center gap-2 rounded border p-2 cursor-pointer">
                <Checkbox checked={quick[k]} onCheckedChange={(v) => setQuick(prev => ({ ...prev, [k]: !!v }))} />
                <span className="text-sm">+{[7, 21, 45][idx]}d</span>
              </label>
            ))}
          </div>
          <div>
            <Label>Horário</Label>
            <Input type="time" value={quickTime} onChange={e => setQuickTime(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div>
              <Label>Horário</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recurrence} onCheckedChange={(v) => setRecurrence(!!v)} />
            Recorrência
          </label>
          {recurrence && (
            <div className="space-y-2 pl-4 border-l-2">
              {intervals.map((it, i) => (
                <div key={it.id} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">A cada (dias)</Label>
                    <Input type="number" min={1} value={it.days} onChange={e => setIntervals(prev => prev.map(x => x.id === it.id ? { ...x, days: +e.target.value } : x))} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Quantas vezes</Label>
                    <Input type="number" min={1} value={it.count} onChange={e => setIntervals(prev => prev.map(x => x.id === it.id ? { ...x, count: +e.target.value } : x))} />
                  </div>
                  {intervals.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setIntervals(prev => prev.filter(x => x.id !== it.id))}><Trash2 className="h-4 w-4" /></Button>
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

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Agendar"}
      </Button>
    </div>
  );
}
