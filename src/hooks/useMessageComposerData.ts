import { supabase } from "@/integrations/supabase/client";
import { fetchAutomationTemplateIds } from "@/lib/automationTemplateIds";
import { fetchAllPages } from "@/lib/fetchAllPages";
import type { PredefinedMessage, Student } from "@/lib/messageRecipients";
import { useQuery } from "@tanstack/react-query";

const EMPTY_STUDENTS: Student[] = [];
const EMPTY_TEMPLATES: PredefinedMessage[] = [];

export function useMessageComposerData() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["message-composer-data"],
    queryFn: async () => {
      const [students, templates, automationIds] = await Promise.all([
        fetchAllPages((from, to) => supabase.from("students")
          .select("id, name, phone, had_evaluation, messages_enabled, status", { count: "exact" }).order("name").order("id").range(from, to)),
        fetchAllPages((from, to) => supabase.from("predefined_messages")
          .select("*", { count: "exact" }).order("title").order("id").range(from, to)),
        fetchAutomationTemplateIds(),
      ]);
      return { students, predefinedMessages: templates.filter((message) => !automationIds.has(message.id)) };
    },
  });
  return {
    students: data?.students ?? EMPTY_STUDENTS,
    predefinedMessages: data?.predefinedMessages ?? EMPTY_TEMPLATES,
    loading: isLoading, loadError: error, refetch,
  };
}
