import { supabase } from "@/integrations/supabase/client";

export interface RegistrationDuplicate {
  id: string;
  name: string;
  matchesCpf: boolean;
  matchesPhone: boolean;
}

/** A shared WhatsApp is allowed, but an existing CPF must be resolved first. */
export async function findRegistrationDuplicates(phone: string, cpf: string): Promise<RegistrationDuplicate[]> {
  const [byPhone, byCpf] = await Promise.all([
    supabase.from("students").select("id,name").eq("phone", phone).limit(10),
    cpf ? supabase.from("students").select("id,name").eq("cpf", cpf).limit(10) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byPhone.error) throw byPhone.error;
  if (byCpf.error) throw byCpf.error;

  const found = new Map<string, RegistrationDuplicate>();
  for (const student of byPhone.data || []) {
    found.set(student.id, { id: student.id, name: student.name, matchesCpf: false, matchesPhone: true });
  }
  for (const student of byCpf.data || []) {
    const current = found.get(student.id);
    found.set(student.id, { id: student.id, name: student.name, matchesCpf: true, matchesPhone: !!current });
  }
  return [...found.values()];
}
