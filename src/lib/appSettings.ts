import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type NotificationSettings = {
  // Mensagens
  notify_failed: boolean;
  notify_sent_each: boolean;
  notify_sent_summary: boolean;
  sent_summary_minutes: number;
  notify_message_rescheduled: boolean;
  notify_message_reenqueued: boolean;
  // Alunos e avaliações
  notify_evaluation_created: boolean;
  notify_evaluation_completed: boolean;
  notify_evaluation_cancelled: boolean;
  notify_evaluation_rescheduled: boolean;
  notify_student_registered: boolean;
  notify_student_status_change: boolean;
  notify_student_deleted: boolean;
  // Sistema
  notify_whatsapp_disconnected: boolean;
  notify_daily_summary: boolean;
  notify_ai_errors: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notify_failed: true,
  notify_sent_each: false,
  notify_sent_summary: true,
  sent_summary_minutes: 10,
  notify_message_rescheduled: false,
  notify_message_reenqueued: true,
  notify_evaluation_created: true,
  notify_evaluation_completed: true,
  notify_evaluation_cancelled: true,
  notify_evaluation_rescheduled: true,
  notify_student_registered: false,
  notify_student_status_change: false,
  notify_student_deleted: false,
  notify_whatsapp_disconnected: true,
  notify_daily_summary: true,
  notify_ai_errors: true,
};

export const NOTIFICATION_SETTINGS_QUERY_KEY = ["app_settings", "notifications"] as const;

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "notifications")
    .maybeSingle();
  if (error) throw error;
  const value = (data?.value as Partial<NotificationSettings> | null) ?? {};
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...value };
}

export async function updateNotificationSettings(
  partial: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const current = await fetchNotificationSettings();
  const merged = { ...current, ...partial };
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "notifications", value: merged as any, updated_at: new Date().toISOString() });
  if (error) throw error;
  return merged;
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: NOTIFICATION_SETTINGS_QUERY_KEY,
    queryFn: fetchNotificationSettings,
    staleTime: 30_000,
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: (data) => {
      qc.setQueryData(NOTIFICATION_SETTINGS_QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: NOTIFICATION_SETTINGS_QUERY_KEY });
    },
  });
}
