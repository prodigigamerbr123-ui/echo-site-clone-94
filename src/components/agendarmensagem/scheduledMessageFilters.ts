import { spDate, spParts } from "@/lib/spTime";

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
  return messages.filter((m) => {
    const matchS = m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.students?.phone.includes(searchTerm);
    const md = new Date(m.scheduled_for);
    const nowSP = spParts(new Date());
    const startToday = spDate(nowSP.y, nowSP.mo, nowSP.d, 0, 0);
    const startMonth = spDate(nowSP.y, nowSP.mo, 1, 0, 0);
    let matchD = true;
    if (dateFilter === "today") {
      const end = spDate(nowSP.y, nowSP.mo, nowSP.d + 1, 0, 0);
      matchD = md >= startToday && md < end;
    } else if (dateFilter === "this-month") {
      const end = spDate(nowSP.y, nowSP.mo + 1, 1, 0, 0);
      matchD = md >= startMonth && md < end;
    } else if (dateFilter === "custom") {
      if (customDateRange.from && customDateRange.to) {
        const to = new Date(customDateRange.to); to.setHours(23, 59, 59, 999);
        matchD = md >= new Date(customDateRange.from) && md <= to;
      } else if (customDateRange.from) {
        matchD = md >= new Date(customDateRange.from);
      }
    }
    const matchU = selectedStudents.length === 0 || selectedStudents.includes(m.student_id);
    return matchS && matchD && matchU;
  });
}

export const getFilteredMessagesCount = (
  messages: ScheduledMessage[], searchTerm: string, dateFilter: string,
  customDateRange: { from?: Date; to?: Date }, selectedStudents: string[],
) => filterScheduledMessages(messages, searchTerm, dateFilter, customDateRange, selectedStudents).length;
