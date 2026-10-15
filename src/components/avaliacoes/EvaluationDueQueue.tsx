import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { errorMessage } from "@/lib/errorMessage";
import { elapsedEvaluationDays } from "@/lib/evaluationDue";
import type { AgendaStudent } from "./agendaTypes";

interface Props {
  overdueQueue: readonly AgendaStudent[];
  dueError: unknown;
  dueReady: boolean;
  daysOverdue: number | null;
  now: number;
  onRetry: () => void;
  onSelectStudent: (studentId: string) => void;
}

export function EvaluationDueQueue({
  overdueQueue,
  dueError,
  dueReady,
  daysOverdue,
  now,
  onRetry,
  onSelectStudent,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Fila de Vencidos
        </CardTitle>
        <CardDescription>
          Até 20 alunos ativos, sem avaliação futura.{" "}
          {daysOverdue !== null &&
            `Reavaliação após mais de ${daysOverdue} dias; primeira avaliação após 14 dias de cadastro.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dueError ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>
              Não foi possível calcular quem precisa de avaliação.{" "}
              {errorMessage(dueError)}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : !dueReady ? (
          <p role="status" className="text-sm text-muted-foreground py-6">
            Carregando alunos e prazo de avaliação…
          </p>
        ) : overdueQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nada vencido — 👏
          </p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {overdueQueue.map((s) => {
              const ref = s.last_evaluation_date || s.created_at;
              const days = Math.floor(elapsedEvaluationDays(ref, now));
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.last_evaluation_date
                        ? `há ${days} dias`
                        : `nunca avaliado (${days}d)`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectStudent(s.id)}
                  >
                    Agendar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
