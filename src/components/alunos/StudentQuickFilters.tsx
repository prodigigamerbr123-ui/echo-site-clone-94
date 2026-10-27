import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useStudentListFilters } from "@/hooks/useStudentListFilters";
import { paymentStatus, type Student } from "./studentListModel";

type Props = Pick<ReturnType<typeof useStudentListFilters>,
  "pendingByStudent" | "isActive" | "isBirthdayThisMonth" | "paymentFilter" | "setPaymentFilter" |
  "statusFilter" | "setStatusFilter" | "flagFilter" | "setFlagFilter"> & { students: Student[] | undefined };

export function StudentQuickFilters({ students, pendingByStudent, isActive, isBirthdayThisMonth, paymentFilter, setPaymentFilter, statusFilter, setStatusFilter, flagFilter, setFlagFilter }: Props) {
  const activeList = (students || []).filter(isActive);
  const overdueCount = activeList.filter((s) => paymentStatus(s.payment_due_date)?.key === "overdue").length;
  const dueSoonCount = activeList.filter((s) => paymentStatus(s.payment_due_date)?.key === "due_soon").length;
  const birthdayCount = activeList.filter(isBirthdayThisMonth).length;
  const noEvalCount = activeList.filter((s) => !s.had_evaluation).length;
  const pendingCount = activeList.filter((s) => (pendingByStudent[s.id] || 0) > 0).length;

  type Chip = { key: string; label: string; count: number; cls: string; onClick: () => void; active: boolean };
  const chips: Chip[] = [
    {
      key: "overdue",
      label: "Prazo vencido",
      count: overdueCount,
      cls: "border-red-500/40 text-red-600 hover:bg-red-500/10",
      active: paymentFilter === "overdue" && statusFilter === "active",
      onClick: () => {
        const on = paymentFilter === "overdue" && statusFilter === "active";
        setPaymentFilter(on ? "all" : "overdue");
        setStatusFilter(on ? "all" : "active");
      },
    },
    {
      key: "due_soon",
      label: "Vence em até 3d",
      count: dueSoonCount,
      cls: "border-amber-500/40 text-amber-600 hover:bg-amber-500/10",
      active: paymentFilter === "due_soon" && statusFilter === "active",
      onClick: () => {
        const on = paymentFilter === "due_soon" && statusFilter === "active";
        setPaymentFilter(on ? "all" : "due_soon");
        setStatusFilter(on ? "all" : "active");
      },
    },
    {
      key: "birthday",
      label: "Aniversariantes do mês",
      count: birthdayCount,
      cls: "border-pink-500/40 text-pink-600 hover:bg-pink-500/10",
      active: flagFilter === "birthday_month",
      onClick: () => setFlagFilter(flagFilter === "birthday_month" ? "none" : "birthday_month"),
    },
    {
      key: "no_eval",
      label: "Nunca avaliados",
      count: noEvalCount,
      cls: "border-blue-500/40 text-blue-600 hover:bg-blue-500/10",
      active: flagFilter === "no_evaluation" && statusFilter === "active",
      onClick: () => {
        // O número conta só ativos; o filtro precisa mostrar a mesma lista.
        const on = flagFilter === "no_evaluation" && statusFilter === "active";
        setFlagFilter(on ? "none" : "no_evaluation");
        setStatusFilter(on ? "all" : "active");
      },
    },
    {
      key: "pending",
      label: "Com mensagens pendentes",
      count: pendingCount,
      cls: "border-purple-500/40 text-purple-600 hover:bg-purple-500/10",
      active: flagFilter === "pending_messages",
      onClick: () => setFlagFilter(flagFilter === "pending_messages" ? "none" : "pending_messages"),
    },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Button
          key={c.key}
          variant="outline"
          size="sm"
          onClick={c.onClick}
          className={`gap-1.5 h-8 ${c.cls} ${c.active ? "ring-2 ring-offset-1 ring-current" : ""}`}
        >
          {c.label}
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
            {c.count}
          </Badge>
        </Button>
      ))}
    </div>
  );
}
