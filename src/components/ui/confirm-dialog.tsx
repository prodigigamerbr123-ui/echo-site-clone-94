import { create } from "zustand";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmState {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve?: (v: boolean) => void;
  ask: (opts: { title: string; description?: string; confirmLabel?: string; destructive?: boolean }) => Promise<boolean>;
  respond: (v: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: "",
  ask: (opts) => {
    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel || "Confirmar",
        destructive: opts.destructive,
        resolve,
      });
    });
  },
  respond: (v: boolean) => {
    const r = get().resolve;
    set({ open: false, resolve: undefined });
    r?.(v);
  },
}));

/** Uso: const confirm = useConfirm(); if (!(await confirm({title:...}))) return; */
export const useConfirm = () => useConfirmStore((s) => s.ask);

export function ConfirmDialogHost() {
  const { open, title, description, confirmLabel, destructive, respond } = useConfirmStore();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && respond(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => respond(true)}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
