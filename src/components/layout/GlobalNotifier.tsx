import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  useNotificationSettings,
} from "@/lib/appSettings";

export function GlobalNotifier() {
  const { data: settings } = useNotificationSettings();
  const settingsRef = useRef<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const sentBucketRef = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({
    count: 0,
    timer: null,
  });

  useEffect(() => {
    if (settings) settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
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
      const cfg = settingsRef.current;
      if (!cfg.notify_sent_summary) return;
      const bucket = sentBucketRef.current;
      bucket.count += 1;
      if (!bucket.timer) {
        const minutes = Math.max(5, Math.min(60, cfg.sent_summary_minutes || 10));
        bucket.timer = setTimeout(flushSent, minutes * 60 * 1000);
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
            if (!settingsRef.current.notify_failed) return;
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
          if (!settingsRef.current.notify_evaluation_created) return;
          const row = payload.new;
          if (!row) return;
          toast("Avaliação agendada", {
            description: new Date(row.scheduled_at).toLocaleString("pt-BR"),
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "students" },
        (payload: any) => {
          if (!settingsRef.current.notify_student_registered) return;
          const row = payload.new;
          if (!row) return;
          toast("Novo aluno cadastrado", { description: row.name });
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
