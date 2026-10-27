import type { Tables } from "@/integrations/supabase/types";

export type AgendaStudent = Pick<
  Tables<"students">,
  | "id"
  | "name"
  | "phone"
  | "status"
  | "had_evaluation"
  | "last_evaluation_date"
  | "created_at"
>;

export type AgendaEvaluation = Pick<
  Tables<"evaluations">,
  "id" | "student_id" | "scheduled_at" | "status" | "notes" | "completed_at"
> & Partial<Pick<Tables<"evaluations">, "performed_on">> & {
  students?: Pick<Tables<"students">, "name" | "phone"> | null;
};

export interface EvaluationFormValues {
  studentId: string;
  date: string;
  time: string;
  notes: string;
}
