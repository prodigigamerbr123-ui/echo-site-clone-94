import { fmtDateISOSP } from "@/lib/spTime";
import type { Tables } from "@/integrations/supabase/types";

export type Student = Pick<Tables<"students">,
  "id" | "name" | "phone" | "birth_date" | "last_evaluation_date" | "had_evaluation" |
  "created_at" | "plan" | "status" | "city" | "payment_due_date" | "cpf"> & Partial<Pick<Tables<"students">, "enrollment_date" | "benefit" | "initial_evaluation_date" | "messages_enabled">>;

export function paymentStatus(due: string | null) {
  if (!due) return null;
  const todayIso = fmtDateISOSP(new Date());
  // Diferença em dias com base em datas de calendário (SP)
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const [dy, dm, dd] = due.split("-").map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const d0 = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.floor((d0 - t0) / 86400000);
  // A data informa o prazo cadastrado, não comprova que houve pagamento.
  if (diffDays < 0) return { key: "overdue" as const, label: "Prazo vencido", cls: "bg-red-500/15 text-red-600 border-red-500/30" };
  if (diffDays <= 3) return { key: "due_soon" as const, label: diffDays === 0 ? "Vence hoje" : `Vence em ${diffDays}d`, cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  return { key: "upcoming" as const, label: "Vencimento futuro", cls: "bg-green-500/15 text-green-600 border-green-500/30" };
}
