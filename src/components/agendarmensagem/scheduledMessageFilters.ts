import { matchesSearchText, matchesStudentSearch } from "@/lib/studentSearch";
import { messageDateWindow, matchesMessageDate } from "@/lib/messageDateFilter";

export interface ScheduledMessage {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
  message_type: string;
  created_at: string;
  student_id: string;
  failure_reason?: string | null;
  retry_count?: number | null;
  evaluation_id?: string | null;
  recurrence_parent_id?: string | null;
  dispatch_started_at?: string | null;
  students?: { name: string; phone: string; };
}

export function filterScheduledMessages(
  messages: ScheduledMessage[],
  searchTerm: string,
  dateFilter: string,
  customDateRange: { from?: Date; to?: Date },
  selectedStudents: string[],
) {
  const window = messageDateWindow(dateFilter, customDateRange);
  return messages.filter((m) => {
    const matchS = matchesSearchText(m.content, searchTerm) || matchesStudentSearch(m.students, searchTerm);
    const matchD = matchesMessageDate(m.scheduled_for, window);
    const matchU = selectedStudents.length === 0 || selectedStudents.includes(m.student_id);
    return matchS && matchD && matchU;
  });
}

export const getFilteredMessagesCount = (
  messages: ScheduledMessage[], searchTerm: string, dateFilter: string,
  customDateRange: { from?: Date; to?: Date }, selectedStudents: string[],
) => filterScheduledMessages(messages, searchTerm, dateFilter, customDateRange, selectedStudents).length;
