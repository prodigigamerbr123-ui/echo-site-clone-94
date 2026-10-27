import { matchesStudentSearch } from "@/lib/studentSearch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errorMessage";
import { CalendarPlus, Search, User } from "lucide-react";
import { useState } from "react";
import type { AgendaStudent, EvaluationFormValues } from "./agendaTypes";

interface Props {
  students: readonly AgendaStudent[] | undefined;
  selected: AgendaStudent | undefined;
  values: EvaluationFormValues;
  today: string;
  saving: boolean;
  studentsLoading: boolean;
  studentsError: unknown;
  onChange: (update: Partial<EvaluationFormValues>) => void;
  onSubmit: () => void;
  onRetry: () => void;
}

export function EvaluationScheduleForm({
  students,
  selected,
  values,
  today,
  saving,
  studentsLoading,
  studentsError,
  onChange,
  onSubmit,
  onRetry,
}: Props) {
  const { date, time, notes } = values;
  const [studentSearch, setStudentSearch] = useState("");
  const [openStudent, setOpenStudent] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5 text-primary" />
          Nova Avaliação
        </CardTitle>
        <CardDescription>
          Agende a avaliação e os lembretes habilitados nas automações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {studentsError ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>
              Não foi possível carregar os alunos. {errorMessage(studentsError)}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : studentsLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando alunos…
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="evaluation-student">Aluno</Label>
          <Popover open={openStudent} onOpenChange={setOpenStudent}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                id="evaluation-student"
                role="combobox"
                aria-expanded={openStudent}
                disabled={studentsLoading || !!studentsError}
                className="w-full justify-between font-normal"
              >
                {selected ? (
                  <span className="flex items-center gap-2 truncate">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {selected.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Selecione um aluno...
                  </span>
                )}
                <Search className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto"
              align="start"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar por nome ou telefone..."
                  value={studentSearch}
                  onValueChange={setStudentSearch}
                />
                <CommandList>
                  <CommandEmpty>Nenhum aluno.</CommandEmpty>
                  <CommandGroup>
                    {students
                      ?.filter((s) => s.status === "active")
                      .filter(student => matchesStudentSearch(student, studentSearch))
                      .slice(0, 100)
                      .map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.id}
                          onSelect={() => {
                            onChange({ studentId: s.id });
                            setOpenStudent(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span>{s.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {s.phone}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => onChange({ date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time">Horário</Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => onChange({ time: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Observações (opcional)</Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        </div>

        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={saving || studentsLoading || !!studentsError}
        >
          <CalendarPlus className="h-4 w-4 mr-2" />
          {saving ? "Agendando..." : "Agendar Avaliação"}
        </Button>
      </CardContent>
    </Card>
  );
}
