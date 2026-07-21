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

    const fetchStudentName = async (id: string | null | undefined) => {
      if (!id) return "";
      const { data } = await supabase
        .from("students")
        .select("name")
        .eq("id", id)
        .maybeSingle();
      return data?.name || "";
    };

    const channel = supabase
      .channel("global-notifier")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scheduled_messages" },
        async (payload: any) => {
          const oldRow = payload.old || {};
          const newRow = payload.new || {};
          const cfg = settingsRef.current;

          // Reagendamento (mudou data e continua pending)
          if (
            oldRow.scheduled_for &&
            newRow.scheduled_for &&
            oldRow.scheduled_for !== newRow.scheduled_for &&
            newRow.status === "pending" &&
            oldRow.status === "pending"
          ) {
            if (cfg.notify_message_rescheduled) {
              toast("Mensagem reagendada", {
                description: new Date(newRow.scheduled_for).toLocaleString("pt-BR"),
              });
            }
          }

          if (oldRow.status === newRow.status) return;

          if (newRow.status === "sent") {
            queueSent();
            return;
          }

          if (newRow.status === "failed" && cfg.notify_failed) {
            const studentName = await fetchStudentName(newRow.student_id);
            toast.error("Mensagem falhou", {
              description: [studentName, newRow.failure_reason].filter(Boolean).join(" — "),
            });
            return;
          }

          // Reenfileirada: failed -> pending
          if (
            oldRow.status === "failed" &&
            newRow.status === "pending" &&
            cfg.notify_message_reenqueued
          ) {
            const studentName = await fetchStudentName(newRow.student_id);
            toast("Mensagem reenfileirada", {
              description: studentName || "Nova tentativa em breve",
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
        { event: "UPDATE", schema: "public", table: "evaluations" },
        async (payload: any) => {
          const oldRow = payload.old || {};
          const newRow = payload.new || {};
          const cfg = settingsRef.current;

          if (
            oldRow.scheduled_at &&
            newRow.scheduled_at &&
            oldRow.scheduled_at !== newRow.scheduled_at &&
            cfg.notify_evaluation_rescheduled
          ) {
            const studentName = await fetchStudentName(newRow.student_id);
            toast("Avaliação remarcada", {
              description: [studentName, new Date(newRow.scheduled_at).toLocaleString("pt-BR")]
                .filter(Boolean)
                .join(" — "),
            });
          }

          if (oldRow.status !== newRow.status) {
            if (newRow.status === "completed" && cfg.notify_evaluation_completed) {
              const studentName = await fetchStudentName(newRow.student_id);
              toast.success("Avaliação realizada", { description: studentName });
            } else if (newRow.status === "cancelled" && cfg.notify_evaluation_cancelled) {
              const studentName = await fetchStudentName(newRow.student_id);
              toast("Avaliação cancelada", { description: studentName });
            }
          }
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "students" },
        (payload: any) => {
          if (!settingsRef.current.notify_student_status_change) return;
          const oldRow = payload.old || {};
          const newRow = payload.new || {};
          if (oldRow.status === newRow.status) return;
          const label = newRow.status === "active" ? "ativo" : "inativo";
          toast(`Aluno marcado como ${label}`, { description: newRow.name });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "students" },
        (payload: any) => {
          if (!settingsRef.current.notify_student_deleted) return;
          const row = payload.old;
          if (!row) return;
          toast("Aluno excluído", { description: row.name });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[GlobalNotifier] Realtime status:", status);
        }
      });

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
