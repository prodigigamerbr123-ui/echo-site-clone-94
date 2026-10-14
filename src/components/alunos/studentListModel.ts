import { fmtDateISOSP } from "@/lib/spTime";

export interface Student {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  last_evaluation_date: string | null;
  had_evaluation: boolean;
  created_at: string;
  plan: string | null;
  status: string;
  city: string | null;
  payment_due_date: string | null;
  cpf: string | null;
}

export function paymentStatus(due: string | null) {
  if (!due) return null;
  const todayIso = fmtDateISOSP(new Date());
  // Diferença em dias com base em datas de calendário (SP)
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const [dy, dm, dd] = due.split("-").map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const d0 = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.floor((d0 - t0) / 86400000);
  if (diffDays < 0) return { label: "Vencido", cls: "bg-red-500/15 text-red-600 border-red-500/30" };
  if (diffDays <= 3) return { label: `Vence em ${diffDays}d`, cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  return { label: "Em dia", cls: "bg-green-500/15 text-green-600 border-green-500/30" };
}
