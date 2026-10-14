import type { Student } from "@/components/alunos/studentListModel";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { useQuery } from "@tanstack/react-query";

export function useStudentListData() {
  const { data: students, isLoading, error: studentsError } = useQuery({
    queryKey: ["students"],
    queryFn: () => fetchAllPages<Student>((from, to) => supabase
      .from("students")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)),
  });

  const { data: pendingScheduled = [], error: pendingError } = useQuery({
    queryKey: ["pending-scheduled-by-student"],
    queryFn: () => fetchAllPages<{ student_id: string }>((from, to) => supabase
      .from("scheduled_messages")
      .select("student_id", { count: "exact" })
      .eq("status", "pending")
      .order("id")
      .range(from, to)),
  });

  return { students, isLoading, studentsError, pendingScheduled, pendingError };
}
