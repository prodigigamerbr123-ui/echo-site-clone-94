import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateISOSP } from "@/lib/spTime";
import { suggestedRenewalDate, validCalendarDate } from "@/lib/planRenewal";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { PLAN_OPTIONS } from "./studentPlans";
import type { Student } from "./studentListModel";

interface Props {
  student: Student;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenovarPlanoDialog({ student, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [plan, setPlan] = useState(student.plan || "Mensal");
  const [dueDate, setDueDate] = useState(suggestedRenewalDate(student.plan || "Mensal", student.payment_due_date) || "");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const today = fmtDateISOSP(new Date());

  useEffect(() => {
    if (!open) return;
    const initialPlan = student.plan || "Mensal";
    setPlan(initialPlan);
    setDueDate(suggestedRenewalDate(initialPlan, student.payment_due_date) || "");
  }, [open, student]);

  const changePlan = (newPlan: string) => {
    setPlan(newPlan);
    setDueDate(suggestedRenewalDate(newPlan, student.payment_due_date) || "");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current || !validCalendarDate(dueDate) || dueDate <= today) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Refuse to overwrite another staff member's more recent plan change.
      const { data: current, error: readError } = await supabase.from("students")
        .select("id, plan, payment_due_date").eq("id", student.id).single();
      if (readError) throw readError;
      if (current.plan !== student.plan || current.payment_due_date !== student.payment_due_date) {
        throw new Error("O plano ou vencimento foi alterado em outra tela. Atualize a lista e confira os dados antes de renovar.");
      }

      let update = supabase.from("students").update({ plan, payment_due_date: dueDate }).eq("id", student.id);
      update = current.plan === null ? update.is("plan", null) : update.eq("plan", current.plan);
      update = current.payment_due_date === null
        ? update.is("payment_due_date", null)
        : update.eq("payment_due_date", current.payment_due_date);
      const { data, error } = await update.select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error("Os dados foram alterados durante a renovação. Atualize a lista e confira o vencimento.");

      for (const key of ["students", "students-summary", "dashboard-stats", "today-actions", "pending-scheduled-by-student"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      void qc.invalidateQueries({ queryKey: ["student-recent-msgs", student.id] });
      void qc.invalidateQueries({ queryKey: ["student-plan-history", student.id] });
      toast({ title: "Plano atualizado", description: `Próximo vencimento: ${dueDate.split("-").reverse().join("/")}. Nenhum pagamento foi registrado.` });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({ title: "Não foi possível confirmar a renovação", description: error instanceof Error ? error.message : "Confira os dados do aluno antes de tentar novamente.", variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <Dialog open={open} onOpenChange={value => !saving && onOpenChange(value)}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Renovar plano</DialogTitle>
        <DialogDescription>Atualize o plano e o próximo vencimento de {student.name}.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={save}>
        <div className="space-y-1 text-sm rounded-md bg-muted p-3">
          <p>Plano atual: <strong>{student.plan || "Não informado"}</strong></p>
          <p>Vencimento atual: <strong>{student.payment_due_date ? student.payment_due_date.split("-").reverse().join("/") : "Não informado"}</strong></p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="renew-plan">Plano após renovação</Label>
          <Select value={plan} onValueChange={changePlan} disabled={saving}>
            <SelectTrigger id="renew-plan"><SelectValue /></SelectTrigger>
            <SelectContent>{PLAN_OPTIONS.map(option => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="renew-due">Próximo vencimento *</Label>
          <Input id="renew-due" type="date" value={dueDate} min={today} onChange={event => setDueDate(event.target.value)} disabled={saving} required />
          <p className="text-xs text-muted-foreground">Sugestão: acrescentar a duração do plano ao vencimento futuro; se estiver vencido, contar de hoje. Confira e ajuste a data antes de salvar. Benefícios e convênios exigem data manual.</p>
        </div>
        <p className="text-sm text-muted-foreground">A alteração ficará registrada no histórico da ficha, com o plano e o vencimento anteriores.</p>
        <p className="text-sm text-amber-700 dark:text-amber-400">Esta ação altera o vencimento para os lembretes e não registra recebimento ou comprovante de pagamento.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving || !validCalendarDate(dueDate) || dueDate <= today}>{saving ? "Salvando..." : "Confirmar renovação"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
