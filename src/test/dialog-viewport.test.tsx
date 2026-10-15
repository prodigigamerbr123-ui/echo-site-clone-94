import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";

it("keeps long dialogs scrollable within the dynamic viewport", () => {
  render(<Dialog open><DialogContent><DialogTitle>Formulário</DialogTitle>
    <DialogDescription>Campos do formulário</DialogDescription><button>Salvar</button>
  </DialogContent></Dialog>);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
});

it("also bounds confirmation dialogs on short screens", () => {
  render(<AlertDialog open><AlertDialogContent><AlertDialogTitle>Confirmar</AlertDialogTitle>
    <AlertDialogDescription>Confira a operação.</AlertDialogDescription>
  </AlertDialogContent></AlertDialog>);
  expect(screen.getByRole("alertdialog")).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto");
});
