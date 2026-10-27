import { useQuery } from "@tanstack/react-query";

import { fetchAutomationSettings } from "@/lib/automationSettings";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { supabase } from "@/integrations/supabase/client";

export function useEvaluationAgendaQueries() {
  const students = useQuery({
    queryKey: ["students-evaluation-agenda"],
    queryFn: () => fetchAllPages((from, to) => supabase
      .from("students")
      .select("id,name,phone,status,had_evaluation,last_evaluation_date,created_at,enrollment_date,messages_enabled", { count: "exact" })
      .order("name").order("id").range(from, to)),
  });

  const evaluations = useQuery({
    queryKey: ["evaluations-list"],
    queryFn: async () => {
      const data = await fetchAllPages((from, to) => supabase
        .from("evaluations")
        .select("id,student_id,scheduled_at,status,notes,completed_at,performed_on,students(name,phone)", { count: "exact" })
        .order("scheduled_at", { ascending: true }).order("id").range(from, to));
      return data;
    },
  });

  const settings = useQuery({
    queryKey: ["automation-settings"],
    queryFn: fetchAutomationSettings,
  });

  return { students, evaluations, settings };
}
