import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { evaluationDayLabel } from "@/lib/evaluationAgendaDates";
import { errorMessage } from "@/lib/errorMessage";
import { fmtTimeSP, spIsToday } from "@/lib/spTime";
import type { AgendaEvaluation } from "./agendaTypes";

interface Props {
  grouped: readonly [string, AgendaEvaluation[]][];
  now: number;
  saving: boolean;
  error: unknown;
  isLoading: boolean;
  onRetry: () => void;
  onDone: (evaluation: AgendaEvaluation) => void;
  onNoShow: (evaluation: AgendaEvaluation) => void;
  onReschedule: (evaluation: AgendaEvaluation) => void;
  onCancel: (evaluation: AgendaEvaluation) => void;
}

export function EvaluationAgendaList({
  grouped,
  now,
  saving,
  error,
  isLoading,
  onRetry,
  onDone,
  onNoShow,
  onReschedule,
  onCancel,
}: Props) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          Agenda
        </CardTitle>
        <CardDescription>Avaliações futuras agrupadas por dia.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>Não foi possível carregar a agenda. {errorMessage(error)}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : isLoading ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Carregando avaliações…
          </p>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Activity className="h-10 w-10 mb-2 opacity-40" />
            <p>Nenhuma avaliação agendada.</p>
          </div>
        ) : (
          <div className="space-y-6 max-h-[720px] overflow-y-auto pr-1">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {evaluationDayLabel(day, new Date(now))}
                </h3>
                <div className="space-y-2">
                  {items.map((ev) => {
                    const when = new Date(ev.scheduled_at);
                    const canClose =
                      spIsToday(when, new Date(now)) || when.getTime() < now;
                    return (
                      <div
                        key={ev.id}
                        className="rounded-lg border p-3 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              <span className="font-semibold">
                                {fmtTimeSP(when)}
                              </span>
                              <span className="font-medium">
                                {ev.students?.name}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {ev.students?.phone}
                              {ev.notes ? ` • ${ev.notes}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {canClose && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => onDone(ev)}
                                  disabled={saving}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />{" "}
                                  Realizada
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => onNoShow(ev)}
                                  disabled={saving}
                                >
                                  <XCircle className="h-3 w-3 mr-1" /> Faltou
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onReschedule(ev)}
                              disabled={saving}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" /> Remarcar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onCancel(ev)}
                              disabled={saving}
                              aria-label={`Cancelar avaliação de ${ev.students?.name ?? "aluno"}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
