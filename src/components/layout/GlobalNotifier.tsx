import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Escuta em tempo real mudanças em scheduled_messages.
 * - 'failed': toast individual sempre (o dono precisa ver imediatamente).
 * - 'sent': acumula e mostra no máximo um toast a cada 10 minutos
 *   ("N mensagens enviadas") para não inundar a tela em envios em massa.
 */
export function GlobalNotifier() {
  const sentBucketRef = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({
    count: 0,
    timer: null,
  });

  useEffect(() => {
    const FLUSH_WINDOW_MS = 10 * 60 * 1000; // 10 min

    const flushSent = () => {
      const bucket = sentBucketRef.current;
      if (bucket.count > 0) {
        toast.success(
          bucket.count === 1
            ? "1 mensagem enviada"
            : `${bucket.count} mensagens enviadas`,
        );
      }
      bucket.count = 0;
      bucket.timer = null;
    };

    const queueSent = () => {
      const bucket = sentBucketRef.current;
      bucket.count += 1;
      if (!bucket.timer) {
        bucket.timer = setTimeout(flushSent, FLUSH_WINDOW_MS);
      }
    };

    const channel = supabase
      .channel("global-scheduled-messages")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scheduled_messages" },
        async (payload: any) => {
          const oldRow = payload.old || {};
          const newRow = payload.new || {};
          if (oldRow.status === newRow.status) return;

          if (newRow.status === "sent") {
            queueSent();
            return;
          }

          if (newRow.status === "failed") {
            let studentName = "";
            if (newRow.student_id) {
              const { data } = await supabase
                .from("students")
                .select("name")
                .eq("id", newRow.student_id)
                .maybeSingle();
              studentName = data?.name || "";
            }
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
      const bucket = sentBucketRef.current;
      if (bucket.timer) {
        clearTimeout(bucket.timer);
        bucket.timer = null;
      }
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
