import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  useNotificationSettings,
} from "@/lib/appSettings";
import { useAuth } from "@/hooks/useAuth";

type ScheduledMessageEvent = {
  id?: string;
  status?: string;
  student_id?: string | null;
  updated_at?: string | null;
  sent_at?: string | null;
  failure_reason?: string | null;
};

export function GlobalNotifier() {
  const { session } = useAuth();
  const { data: settings } = useNotificationSettings(Boolean(session));
  const settingsRef = useRef<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const lastMessageCheckRef = useRef<string | null>(null);
  const handledMessageEventsRef = useRef<Set<string>>(new Set());
  const sentBucketRef = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({
    count: 0,
    timer: null,
  });
  const settingsLoaded = Boolean(settings);

  useEffect(() => {
    if (settings) settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!session || !settingsLoaded) return;
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

    const markMessageEventHandled = (row: ScheduledMessageEvent) => {
      if (!row.id || !row.status) return false;
      const stamp = row.updated_at || row.sent_at || "";
      const key = `${row.id}:${row.status}:${stamp}`;
      const handled = handledMessageEventsRef.current;
      if (handled.has(key)) return false;
      handled.add(key);
      if (handled.size > 500) {
        for (const oldKey of Array.from(handled).slice(0, 250)) handled.delete(oldKey);
      }
      if (row.updated_at && (!lastMessageCheckRef.current || row.updated_at > lastMessageCheckRef.current)) {
        lastMessageCheckRef.current = row.updated_at;
      }
      return true;
    };

    const notifyMessageStatus = async (row: ScheduledMessageEvent) => {
      if (!markMessageEventHandled(row)) return;
      const cfg = settingsRef.current;

      if (row.status === "sent") {
        if (cfg.notify_sent_each) {
          const studentName = await fetchStudentName(row.student_id);
          toast.success("Mensagem enviada", { description: studentName || undefined });
        }
        queueSent();
        return;
      }

      if (row.status === "failed" && cfg.notify_failed) {
        const studentName = await fetchStudentName(row.student_id);
        toast.error("Mensagem falhou", {
          description: [studentName, row.failure_reason].filter(Boolean).join(" — "),
        });
      }
    };

    const initializeMessagePolling = async () => {
      const { data } = await supabase
        .from("scheduled_messages")
        .select("id, updated_at, status")
        .in("status", ["sent", "failed"])
        .order("updated_at", { ascending: false })
        .limit(20);

      const newest = data?.[0]?.updated_at || new Date().toISOString();
      lastMessageCheckRef.current = newest;
      for (const row of data || []) {
        if (row.id && row.status && row.updated_at) {
          handledMessageEventsRef.current.add(`${row.id}:${row.status}:${row.updated_at}`);
        }
      }
    };

    const pollMessageStatuses = async () => {
      const cursor = lastMessageCheckRef.current;
      if (!cursor) return;

      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("id, status, student_id, updated_at, sent_at, failure_reason")
        .in("status", ["sent", "failed"])
        .gt("updated_at", cursor)
        .order("updated_at", { ascending: true })
        .limit(50);

      if (error) {
        console.warn("[GlobalNotifier] Falha ao checar mensagens:", error.message);
        return;
      }

      for (const row of data || []) await notifyMessageStatus(row);
    };

    initializeMessagePolling();
    const pollingTimer = window.setInterval(pollMessageStatuses, 8_000);

    const channel = supabase
      .channel("global-notifier")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scheduled_messages" },
        async (payload: any) => {
          const oldRow = payload.old || {};
          const newRow = payload.new || {};
          const cfg = settingsRef.current;

          // Reagendamento manual: mudou data, continua pending, e NÃO é retry
          // (retry do process-scheduled-messages atualiza scheduled_for + retry_count
          // ou seta failure_reason — nunca é uma edição do usuário)
          const isRetry =
            (Number(newRow.retry_count) || 0) > (Number(oldRow.retry_count) || 0) ||
            (newRow.failure_reason && newRow.failure_reason !== oldRow.failure_reason);
          if (
            oldRow.scheduled_for &&
            newRow.scheduled_for &&
            oldRow.scheduled_for !== newRow.scheduled_for &&
            newRow.status === "pending" &&
            oldRow.status === "pending" &&
            !isRetry
          ) {
            if (cfg.notify_message_rescheduled) {
              toast("Mensagem reagendada", {
                description: new Date(newRow.scheduled_for).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
              });
            }
          }

          if (oldRow.status === newRow.status) return;

          if (newRow.status === "sent" || newRow.status === "failed") {
            await notifyMessageStatus(newRow);
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
            description: new Date(row.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
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
              description: [studentName, new Date(newRow.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })]
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
      window.clearInterval(pollingTimer);
      supabase.removeChannel(channel);
    };
  }, [session, settingsLoaded]);

  return null;
}
