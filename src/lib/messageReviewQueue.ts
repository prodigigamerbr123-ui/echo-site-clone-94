import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";
import type { Tables } from "@/integrations/supabase/types";
import { OUTSTANDING_DELIVERY_FILTER } from "@/lib/messageDeliveryState";

export type ReviewQueueMessage = Pick<Tables<"scheduled_messages">,
  "id" | "student_id" | "content" | "status" | "scheduled_for" | "updated_at"> &
  Partial<Pick<Tables<"scheduled_messages">, "dispatch_started_at">>;

/** Read only the selected students' outstanding messages; exclude delivery history. */
export async function fetchMessageReviewQueue(studentIds: string[]): Promise<ReviewQueueMessage[]> {
  const ids = [...new Set(studentIds)].sort();
  const result: ReviewQueueMessage[] = [];
  // Keep REST URLs bounded even when the composer selects its maximum 500 students.
  for (let offset = 0; offset < ids.length; offset += 100) {
    const selected = ids.slice(offset, offset + 100);
    result.push(...await fetchAllPages((from, to) => supabase.from("scheduled_messages")
      .select("id,student_id,content,status,scheduled_for,updated_at,dispatch_started_at", { count: "exact" })
      .in("student_id", selected).or(OUTSTANDING_DELIVERY_FILTER)
      .order("scheduled_for").order("id").range(from, to)));
  }
  return result.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for) || a.id.localeCompare(b.id));
}
