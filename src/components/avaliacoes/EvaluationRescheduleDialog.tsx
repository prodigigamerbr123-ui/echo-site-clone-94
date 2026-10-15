import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgendaEvaluation } from "./agendaTypes";

interface Props {
  rescheduleTarget: AgendaEvaluation | null;
  rDate: string;
  rTime: string;
  today: string;
  saving: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function EvaluationRescheduleDialog({
  rescheduleTarget,
  rDate,
  rTime,
  today,
  saving,
  onDateChange,
  onTimeChange,
  onClose,
  onSubmit,
}: Props) {
  return (
    <Dialog
      open={!!rescheduleTarget}
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remarcar avaliação</DialogTitle>
          <DialogDescription>
            {rescheduleTarget?.students?.name} — novas mensagens automáticas
            serão geradas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-date">Data</Label>
            <Input
              id="reschedule-date"
              type="date"
              disabled={saving}
              value={rDate}
              min={today}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-time">Horário</Label>
            <Input
              id="reschedule-time"
              type="time"
              disabled={saving}
              value={rTime}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
