
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay } from "date-fns";

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);

      // Get total students
      const { count: totalStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      // Get messages to send today from scheduled_messages
      const { count: messagesToSendToday } = await supabase
        .from('scheduled_messages')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('scheduled_for', todayStart.toISOString())
        .lte('scheduled_for', todayEnd.toISOString());

      // Get scheduled messages for next 24 hours
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const { count: scheduledMessages } = await supabase
        .from('scheduled_messages')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('scheduled_for', now.toISOString())
        .lte('scheduled_for', tomorrow.toISOString());

      // Get messages sent today
      const { count: messagesSentToday } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', todayStart.toISOString())
        .lte('sent_at', todayEnd.toISOString());

      // Get students with birthdays today - fix the date format comparison
      const todayMonth = format(now, 'MM');
      const todayDay = format(now, 'dd');
      
      const { data: birthdayStudents } = await supabase
        .from('students')
        .select('*')
        .not('birth_date', 'is', null);

      // Filter birthdays on the client side since Supabase has issues with date comparisons
      const birthdaysToday = birthdayStudents?.filter(student => {
        if (!student.birth_date) return false;
        const birthDate = new Date(student.birth_date);
        const birthMonth = format(birthDate, 'MM');
        const birthDay = format(birthDate, 'dd');
        return birthMonth === todayMonth && birthDay === todayDay;
      }).length || 0;

      console.log('Dashboard Stats:', {
        totalStudents,
        messagesToSendToday,
        scheduledMessages,
        birthdaysToday
      });

      return {
        totalStudents: totalStudents || 0,
        messagesToSendToday: messagesToSendToday || 0,
        scheduledMessages: scheduledMessages || 0,
        messagesSentToday: messagesSentToday || 0,
        birthdaysToday,
      };
    },
  });
};

export const useTodayActions = () => {
  return useQuery({
    queryKey: ['today-actions'],
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = subDays(now, 7);
      const twentyOneDaysAgo = subDays(now, 21);
      const todayMonth = format(now, 'MM');
      const todayDay = format(now, 'dd');

      // Get students with birthdays today
      const { data: allStudents } = await supabase
        .from('students')
        .select('id, name, phone, birth_date')
        .not('birth_date', 'is', null);

      // Filter birthdays on the client side
      const birthdayStudents = allStudents?.filter(student => {
        if (!student.birth_date) return false;
        const birthDate = new Date(student.birth_date);
        const birthMonth = format(birthDate, 'MM');
        const birthDay = format(birthDate, 'dd');
        return birthMonth === todayMonth && birthDay === todayDay;
      }) || [];

      // Get students with evaluations that are overdue (more than 7 days)
      const { data: studentsNeedingEvaluation } = await supabase
        .from('students')
        .select('id, name, phone, last_evaluation_date, had_evaluation')
        .or(`last_evaluation_date.lt.${format(sevenDaysAgo, 'yyyy-MM-dd')},and(had_evaluation.eq.false)`);

      // Get students created 7 days ago for first follow-up
      const { data: studentsNeeding7DayFollowUp } = await supabase
        .from('students')
        .select('id, name, phone, created_at')
        .gte('created_at', format(sevenDaysAgo, 'yyyy-MM-dd'))
        .lt('created_at', format(subDays(sevenDaysAgo, -1), 'yyyy-MM-dd'));

      // Get students created 21 days ago for second follow-up
      const { data: studentsNeeding21DayFollowUp } = await supabase
        .from('students')
        .select('id, name, phone, created_at')
        .gte('created_at', format(twentyOneDaysAgo, 'yyyy-MM-dd'))
        .lt('created_at', format(subDays(twentyOneDaysAgo, -1), 'yyyy-MM-dd'));

      const actions = [];

      // Add birthday actions
      birthdayStudents.forEach(student => {
        actions.push({
          id: student.id,
          name: student.name,
          phone: student.phone,
          action: "Aniversário hoje! 🎂",
          type: "birthday" as const
        });
      });

      // Add evaluation actions
      if (studentsNeedingEvaluation) {
        studentsNeedingEvaluation.forEach(student => {
          if (!student.had_evaluation) {
            actions.push({
              id: student.id,
              name: student.name,
              phone: student.phone,
              action: "Primeira avaliação física",
              type: "evaluation" as const
            });
          } else if (student.last_evaluation_date) {
            const daysSinceEvaluation = Math.floor(
              (now.getTime() - new Date(student.last_evaluation_date).getTime()) / (1000 * 60 * 60 * 24)
            );
            actions.push({
              id: student.id,
              name: student.name,
              phone: student.phone,
              action: `Avaliação física vencida (${daysSinceEvaluation} dias)`,
              type: "evaluation" as const
            });
          }
        });
      }

      // Add 7-day follow-up actions
      if (studentsNeeding7DayFollowUp) {
        studentsNeeding7DayFollowUp.forEach(student => {
          actions.push({
            id: student.id,
            name: student.name,
            phone: student.phone,
            action: "Daqui 7 dias - Primeira semana",
            type: "daqui_7_dias" as const
          });
        });
      }

      // Add 21-day follow-up actions
      if (studentsNeeding21DayFollowUp) {
        studentsNeeding21DayFollowUp.forEach(student => {
          actions.push({
            id: student.id,
            name: student.name,
            phone: student.phone,
            action: "Daqui 21 dias - Terceira semana",
            type: "daqui_21_dias" as const
          });
        });
      }

      return actions;
    },
  });
};
