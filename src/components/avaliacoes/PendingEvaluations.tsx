import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { fmtDateSP, fmtTimeSP } from "@/lib/spTime";
import type { AgendaEvaluation } from "./agendaTypes";

interface Props {
  evaluations: readonly AgendaEvaluation[];
  saving: boolean;
  onDone: (evaluation: AgendaEvaluation) => void;
  onNoShow: (evaluation: AgendaEvaluation) => void;
  onReschedule?: (evaluation: AgendaEvaluation) => void;
  onCancel?: (evaluation: AgendaEvaluation) => void;
}

export function PendingEvaluations({
  evaluations,
  saving,
  onDone,
  onNoShow,
  onReschedule,
  onCancel,
}: Props) {
  if (!evaluations.length) return null;
  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-warning">
          <AlertTriangle className="h-5 w-5" />
          Avaliações para fechar ({evaluations.length})
        </CardTitle>
        <CardDescription>
          Confira o que aconteceu antes de registrar o resultado. Também é possível remarcar ou cancelar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {evaluations.map((ev) => (
          <div
            key={ev.id}
            className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-background p-3"
          >
            <div className="min-w-0 break-words">
              <p className="font-medium">{ev.students?.name}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDateSP(new Date(ev.scheduled_at))} às{" "}
                {fmtTimeSP(new Date(ev.scheduled_at))} • {ev.students?.phone}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onDone(ev)} disabled={saving}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Realizada
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onNoShow(ev)}
                disabled={saving}
              >
                <XCircle className="h-3 w-3 mr-1" /> Faltou
              </Button>
              {onReschedule && <Button size="sm" variant="outline" disabled={saving} onClick={() => onReschedule(ev)}>Remarcar</Button>}
              {onCancel && <Button size="sm" variant="ghost" disabled={saving} onClick={() => onCancel(ev)}>Cancelar avaliação</Button>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
