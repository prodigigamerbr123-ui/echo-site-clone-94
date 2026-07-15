import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Escuta em tempo real mudanças em scheduled_messages e mostra
 * um pop-up (sonner) sempre que uma mensagem for enviada ou falhar.
 */
export function GlobalNotifier() {
  useEffect(() => {
    const channel = supabase
      .channel("global-scheduled-messages")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scheduled_messages" },
        async (payload: any) => {
          const oldRow = payload.old || {};
          const newRow = payload.new || {};
          if (oldRow.status === newRow.status) return;

          // Buscar nome do aluno pra mensagem mais amigável
          let studentName = "";
          if (newRow.student_id) {
            const { data } = await supabase
              .from("students")
              .select("name")
              .eq("id", newRow.student_id)
              .maybeSingle();
            studentName = data?.name || "";
          }

          if (newRow.status === "sent") {
            toast.success("Mensagem enviada", {
              description: studentName ? `Para ${studentName}` : undefined,
            });
          } else if (newRow.status === "failed") {
            toast.error("Mensagem falhou", {
              description: [studentName, newRow.failure_reason]
                .filter(Boolean)
                .join(" — "),
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "evaluations" },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          toast("Avaliação agendada", {
            description: new Date(row.scheduled_at).toLocaleString("pt-BR"),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
