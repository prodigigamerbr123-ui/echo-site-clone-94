import type { TablesInsert } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

/** A retry reuses the reviewed identifier and never overwrites an existing student. */
export async function saveStudentRegistration(payload: TablesInsert<"students"> & { id: string }) {
  const { error } = await supabase.from("students")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  const result = await supabase.from("students").select("*").eq("id", payload.id).single();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Não foi possível confirmar o cadastro. Tente novamente.");
  return result.data;
}
