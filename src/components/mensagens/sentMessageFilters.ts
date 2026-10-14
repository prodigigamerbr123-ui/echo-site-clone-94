export interface Message {
  id: string;
  content: string;
  status: string;
  sent_at: string;
  student_id: string;
  students?: {
    name: string;
    phone: string;
  };
}

const filterMessagesByDate = (messages: Message[], dateFilter: string, customDateRange: { from?: Date; to?: Date }) => {
  if (dateFilter === "all") return messages;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return messages.filter((message) => {
    const messageDate = new Date(message.sent_at);

    if (dateFilter === "today") {
      return messageDate >= today;
    } else if (dateFilter === "this-month") {
      return messageDate >= thisMonth;
    } else if (dateFilter === "custom" && customDateRange.from) {
      const fromDate = new Date(customDateRange.from.getFullYear(), customDateRange.from.getMonth(), customDateRange.from.getDate());
      const toDate = customDateRange.to
        ? new Date(customDateRange.to.getFullYear(), customDateRange.to.getMonth(), customDateRange.to.getDate(), 23, 59, 59)
        : new Date(customDateRange.from.getFullYear(), customDateRange.from.getMonth(), customDateRange.from.getDate(), 23, 59, 59);

      return messageDate >= fromDate && messageDate <= toDate;
    }

    return true;
  });
};

export const filterSentMessages = (messages: Message[], searchTerm: string, dateFilter: string, customDateRange: { from?: Date; to?: Date }, selectedStudents: string[] = []) => {
  const filteredBySearch = messages.filter((message) => {
    const matchesSearch =
      message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.students?.phone.includes(searchTerm);

    const matchesStudentFilter = selectedStudents.length === 0 || selectedStudents.includes(message.student_id);

    return matchesSearch && matchesStudentFilter;
  });

  return filterMessagesByDate(filteredBySearch, dateFilter, customDateRange);
};

export const getFilteredMessagesCount = (...args: Parameters<typeof filterSentMessages>) => filterSentMessages(...args).length;
