import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "./fetchAllPages";

export function fetchEvaluationHistory() {
  return fetchAllPages((from, to) => supabase.from("evaluations")
    .select("id,student_id,scheduled_at,status,notes,completed_at,students(name,phone)", { count: "exact" })
    .order("scheduled_at", { ascending: false }).order("id").range(from, to));
}
