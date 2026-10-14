import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { current, listeners, setState, type State } from "./confirm-dialog-store";

export function ConfirmDialogHost() {
  const [s, set] = useState<State>(current);
  useEffect(() => {
    const l = (x: State) => set(x);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const respond = (v: boolean) => {
    const r = s.resolve;
    setState({ ...s, open: false, resolve: undefined });
    r?.(v);
  };
  return (
    <AlertDialog open={s.open} onOpenChange={(o) => !o && respond(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{s.title}</AlertDialogTitle>
          {s.description && <AlertDialogDescription>{s.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => respond(true)}
            className={s.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {s.confirmLabel || "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
