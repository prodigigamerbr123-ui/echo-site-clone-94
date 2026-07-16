import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type NotificationSettings = {
  notify_failed: boolean;
  notify_sent_summary: boolean;
  sent_summary_minutes: number;
  notify_evaluation_created: boolean;
  notify_whatsapp_disconnected: boolean;
  notify_student_registered: boolean;
  notify_daily_summary: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notify_failed: true,
  notify_sent_summary: true,
  sent_summary_minutes: 10,
  notify_evaluation_created: true,
  notify_whatsapp_disconnected: true,
  notify_student_registered: false,
  notify_daily_summary: true,
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
