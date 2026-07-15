import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarPlus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  User,
  Activity,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Student {
  id: string;
  name: string;
  phone: string;
  had_evaluation: boolean;
  last_evaluation_date: string | null;
}

interface ScheduledEval {
  id: string;
  student_id: string;
  content: string;
  scheduled_for: string;
  status: string;
  message_type: string;
  students?: { name: string; phone: string } | null;
}

const isOverdue = (dateStr: string | null) => {
  if (!dateStr) return false;
  const diffDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
};

export default function AgendarAvaliacao() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [studentId, setStudentId] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState("");
  const [openStudent, setOpenStudent] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [type, setType] = useState<"reminder" | "followup">("reminder");
  const [customMessage, setCustomMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: students } = useQuery({
    queryKey: ["students-evaluation"],
    queryFn: async () => {
      const pageSize = 1000;
      let all: Student[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("students")
          .select("id,name,phone,had_evaluation,last_evaluation_date")
          .order("name", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data as Student[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const { data: upcoming } = useQuery({
    queryKey: ["scheduled-evaluations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("id,student_id,content,scheduled_for,status,message_type,students(name,phone)")
        .in("message_type", ["evaluation_reminder", "evaluation_followup"])
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return data as ScheduledEval[];
    },
  });

  const selectedStudent = useMemo(
    () => students?.find((s) => s.id === studentId),
    [students, studentId],
  );

  const stats = useMemo(() => {
    const total = students?.length || 0;
    const pending = students?.filter((s) => !s.had_evaluation).length || 0;
    const overdue = students?.filter((s) => isOverdue(s.last_evaluation_date)).length || 0;
    const scheduled = upcoming?.length || 0;
    return { total, pending, overdue, scheduled };
  }, [students, upcoming]);

  const defaultMessage = (name: string) =>
    type === "reminder"
      ? `Olá ${name}! 📋 Lembrete: sua avaliação física está marcada para hoje. Vamos lá! 💪`
      : `Olá ${name}! 📈 Como foi sua avaliação física? Vamos acompanhar sua evolução juntos! 💪`;

  const handleSchedule = async () => {
    if (!selectedStudent) {
      toast({ title: "Selecione um aluno", variant: "destructive" });
      return;
    }
    if (!date) {
      toast({ title: "Escolha uma data", variant: "destructive" });
      return;
    }
    const scheduledFor = new Date(`${date}T${time || "09:00"}:00`);
    if (scheduledFor <= new Date()) {
      toast({
        title: "Data inválida",
        description: "A avaliação deve ser agendada para o futuro.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const content = customMessage.trim() || defaultMessage(selectedStudent.name);
      const { error } = await supabase.from("scheduled_messages").insert([
        {
          student_id: selectedStudent.id,
          content,
          scheduled_for: scheduledFor.toISOString(),
          message_type: type === "reminder" ? "evaluation_reminder" : "evaluation_followup",
          status: "pending",
        },
      ]);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["scheduled-evaluations"] });
      queryClient.invalidateQueries({ queryKey: ["students-evaluation"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages"] });

      toast({
        title: "Avaliação agendada",
        description: `${selectedStudent.name} — ${format(scheduledFor, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });
      setStudentId("");
      setDate("");
      setTime("09:00");
      setCustomMessage("");
    } catch (e: any) {
      toast({
        title: "Erro ao agendar",
        description: e.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from("scheduled_messages")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["scheduled-evaluations"] });
    queryClient.invalidateQueries({ queryKey: ["scheduled-messages"] });
    toast({ title: "Agendamento cancelado" });
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-primary to-primary/70 rounded-lg shadow-lg">
          <CalendarPlus className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Agendar Avaliação Física</h1>
          <p className="text-muted-foreground">
            Programe avaliações e lembretes automáticos para seus alunos
          </p>
        </div>
      </div>

      {/* Stats sincronizadas com a Visão Geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total de Alunos</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-destructive">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vencidas (+90d)</p>
            <p className="text-2xl font-bold text-warning">{stats.overdue}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Agendadas</p>
            <p className="text-2xl font-bold text-primary">{stats.scheduled}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Formulário */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Novo Agendamento
            </CardTitle>
            <CardDescription>
              Selecione o aluno, defina data e o tipo de acompanhamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Aluno */}
            <div className="space-y-2">
              <Label>Aluno</Label>
              <Popover open={openStudent} onOpenChange={setOpenStudent}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedStudent ? (
                      <span className="flex items-center gap-2 truncate">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {selectedStudent.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Selecione um aluno...</span>
                    )}
                    <Search className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Buscar por nome ou telefone..."
                      value={studentSearch}
                      onValueChange={setStudentSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Nenhum aluno encontrado.</CommandEmpty>
                      <CommandGroup>
                        {students
                          ?.filter((s) => {
                            const q = studentSearch.toLowerCase();
                            return (
                              !q ||
                              s.name.toLowerCase().includes(q) ||
                              s.phone.includes(q)
                            );
                          })
                          .slice(0, 100)
                          .map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.id}
                              onSelect={() => {
                                setStudentId(s.id);
                                setOpenStudent(false);
                              }}
                              className="flex items-center justify-between"
                            >
                              <div className="flex flex-col">
                                <span>{s.name}</span>
                                <span className="text-xs text-muted-foreground">{s.phone}</span>
                              </div>
                              {isOverdue(s.last_evaluation_date) ? (
                                <Badge variant="destructive" className="text-[10px]">Vencida</Badge>
                              ) : !s.had_evaluation ? (
                                <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                              ) : (
                                <CheckCircle2 className="h-3 w-3 text-success" />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Data e hora */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time">Horário</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de acompanhamento</Label>
              <Select value={type} onValueChange={(v: "reminder" | "followup") => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Lembrete de avaliação</SelectItem>
                  <SelectItem value="followup">Mensagem de acompanhamento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mensagem */}
            <div className="space-y-2">
              <Label htmlFor="msg">Mensagem (opcional)</Label>
              <Textarea
                id="msg"
                rows={3}
                placeholder={
                  selectedStudent
                    ? defaultMessage(selectedStudent.name)
                    : "Deixe em branco para usar a mensagem padrão."
                }
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={handleSchedule} disabled={saving}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              {saving ? "Agendando..." : "Agendar Avaliação"}
            </Button>
          </CardContent>
        </Card>

        {/* Próximas agendadas */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Próximas Avaliações Agendadas
            </CardTitle>
            <CardDescription>
              Todas as avaliações pendentes de disparo — sincronizado com a Visão Geral.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!upcoming || upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Activity className="h-10 w-10 mb-2 opacity-40" />
                <p>Nenhuma avaliação agendada ainda.</p>
                <p className="text-xs">Use o formulário ao lado para criar a primeira.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {upcoming.map((u) => {
                  const when = new Date(u.scheduled_for);
                  const soon = when.getTime() - Date.now() < 1000 * 60 * 60 * 24 * 2;
                  return (
                    <div
                      key={u.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{u.students?.name ?? "—"}</span>
                          <Badge
                            variant={u.message_type === "evaluation_reminder" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {u.message_type === "evaluation_reminder" ? "Lembrete" : "Acompanhamento"}
                          </Badge>
                          {soon && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertCircle className="h-3 w-3" />
                              em breve
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(when, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          {u.students?.phone ? ` • ${u.students.phone}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {u.content}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCancel(u.id)}
                        title="Cancelar agendamento"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
