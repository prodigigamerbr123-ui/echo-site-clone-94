import { messageDateWindow, matchesMessageDate } from "@/lib/messageDateFilter";
import { matchesSearchText, matchesStudentSearch } from "@/lib/studentSearch";
import type { Tables } from "@/integrations/supabase/types";

export type Message = Pick<Tables<"messages">, "id" | "content" | "status" | "sent_at" | "student_id"> & {
  students?: Pick<Tables<"students">, "name" | "phone"> | null;
};

export const filterSentMessages = (messages: Message[], searchTerm: string, dateFilter: string, customDateRange: { from?: Date; to?: Date }, selectedStudents: string[] = []) => {
  const filteredBySearch = messages.filter((message) => {
    const matchesSearch = matchesSearchText(message.content, searchTerm) || matchesStudentSearch(message.students, searchTerm);

    const matchesStudentFilter = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);

    return matchesSearch && matchesStudentFilter;
  });

  const window = messageDateWindow(dateFilter, customDateRange);
  return filteredBySearch.filter(message => matchesMessageDate(message.sent_at, window));
};

export const getFilteredMessagesCount = (...args: Parameters<typeof filterSentMessages>) => filterSentMessages(...args).length;
