import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, X, Loader2 } from "lucide-react";

import type {
  ActionState,
  PendingAction,
} from "../../../supabase/functions/_shared/aiChatContracts";
export type { PendingAction } from "../../../supabase/functions/_shared/aiChatContracts";

interface Props {
  action: PendingAction;
  onConfirm: () => void;
  onReject: () => void;
  isRunning?: boolean;
  state: ActionState;
  disabled?: boolean;
}

export function AIActionConfirmation({
  action,
  onConfirm,
  onReject,
  isRunning,
  state,
  disabled,
}: Props) {
  const labels: Record<ActionState, string> = {
    pending: "Confirmação necessária",
    executing: "Ação em execução",
    completed: "Executado.",
    failed:
      "Execução falhou. Confira os registros antes de solicitar outra proposta.",
    rejected: "Cancelado.",
    expired: "Proposta expirada. Solicite uma nova.",
    blocked: "Operação bloqueada. Confira o resultado.",
  };
  return (
    <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
              {state === "pending"
                ? "Confirmação necessária"
                : "Estado da proposta"}
            </p>
            <p className="text-sm mt-1 text-foreground whitespace-pre-wrap">
              {action.description}
            </p>
          </div>
        </div>
        {state === "completed" && (
          <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Executado.
          </p>
        )}
        {state === "rejected" && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <X className="h-3 w-3" /> Cancelado.
          </p>
        )}
        {state !== "pending" &&
          state !== "completed" &&
          state !== "rejected" && (
            <p className="text-xs text-muted-foreground" role="status">
              {labels[state]}
            </p>
          )}
        {state === "pending" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={isRunning || disabled}
            >
              {isRunning ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3 mr-1" />
              )}
              Confirmar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isRunning || disabled}
            >
              <X className="h-3 w-3 mr-1" /> Cancelar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
