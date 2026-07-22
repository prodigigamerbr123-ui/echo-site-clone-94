import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, X, Loader2 } from 'lucide-react';

export interface PendingAction {
  id: string;
  tool: string;
  args: any;
  description: string;
}

interface Props {
  action: PendingAction;
  onConfirm: () => void;
  onReject: () => void;
  isRunning?: boolean;
  done?: 'confirmed' | 'rejected';
}

export function AIActionConfirmation({ action, onConfirm, onReject, isRunning, done }: Props) {
  return (
    <Card className="border-warning/40 bg-warning/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-warning uppercase tracking-wide">
              Confirmação necessária
            </p>
            <p className="text-sm mt-1 text-foreground whitespace-pre-wrap">
              {action.description}
            </p>
          </div>
        </div>
        {done === 'confirmed' && (
          <p className="text-xs text-success flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Executado.
          </p>
        )}
        {done === 'rejected' && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <X className="h-3 w-3" /> Cancelado.
          </p>
        )}
        {!done && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onConfirm} disabled={isRunning}>
              {isRunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={isRunning}>
              <X className="h-3 w-3 mr-1" /> Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
