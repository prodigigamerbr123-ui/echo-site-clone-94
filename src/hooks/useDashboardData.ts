
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, endOfWeek, startOfWeek } from "date-fns";

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      // Get total students
      const { count: totalStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      // Active students
      const { count: activeStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Inactive students
      const { count: inactiveStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'active');

      // New students this month
      const { count: newStudentsMonth } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

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

      // Evaluations today (scheduled)
      const { count: evaluationsToday } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('scheduled_at', todayStart.toISOString())
        .lte('scheduled_at', todayEnd.toISOString());

      // Evaluations this week (scheduled)
      const { count: evaluationsWeek } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('scheduled_at', weekStart.toISOString())
        .lte('scheduled_at', weekEnd.toISOString());

      // Evaluations this month (scheduled)
      const { count: evaluationsMonth } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('scheduled_at', monthStart.toISOString())
        .lte('scheduled_at', monthEnd.toISOString());

      // Overdue evaluations (scheduled in the past, not completed)
      const { count: evaluationsOverdue } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .lt('scheduled_at', todayStart.toISOString());

      // Evaluations completed this month
      const { count: evaluationsCompletedMonth } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', monthStart.toISOString())
        .lte('completed_at', monthEnd.toISOString());

      // Students without any evaluation yet
      const { count: studentsWithoutEvaluation } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('had_evaluation', false);

      // Get students with birthdays today - fix the date format comparison
      const todayMonth = format(now, 'MM');
      const todayDay = format(now, 'dd');
      
      const { data: birthdayStudents } = await supabase
        .from('students')
        .select('*')
        .not('birth_date', 'is', null)
        .limit(5000);


      // Filter birthdays on the client side since Supabase has issues with date comparisons
      // Comparar mês/dia por string para evitar conversão UTC->local (bug de fuso em SP)
      const birthdaysToday = birthdayStudents?.filter(student => {
        if (!student.birth_date) return false;
        const [, m, d] = student.birth_date.split("-");
        return m === todayMonth && d === todayDay;
      }).length || 0;

      // Mensalidade: vencidos (payment_due_date < hoje) e vencendo em 3 dias
      const todayStr = format(now, 'yyyy-MM-dd');
      const in3DaysStr = format(subDays(now, -3), 'yyyy-MM-dd');

      const { count: paymentOverdueCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .not('payment_due_date', 'is', null)
        .lt('payment_due_date', todayStr);

      const { count: paymentDueIn3DaysCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .not('payment_due_date', 'is', null)
        .gte('payment_due_date', todayStr)
        .lte('payment_due_date', in3DaysStr);

      return {
        totalStudents: totalStudents || 0,
        activeStudents: activeStudents || 0,
        inactiveStudents: inactiveStudents || 0,
        newStudentsMonth: newStudentsMonth || 0,
        messagesToSendToday: messagesToSendToday || 0,
        scheduledMessages: scheduledMessages || 0,
        messagesSentToday: messagesSentToday || 0,
        evaluationsToday: evaluationsToday || 0,
        evaluationsWeek: evaluationsWeek || 0,
        evaluationsMonth: evaluationsMonth || 0,
        evaluationsOverdue: evaluationsOverdue || 0,
        evaluationsCompletedMonth: evaluationsCompletedMonth || 0,
        studentsWithoutEvaluation: studentsWithoutEvaluation || 0,
        birthdaysToday,
        paymentOverdueCount: paymentOverdueCount || 0,
        paymentDueIn3DaysCount: paymentDueIn3DaysCount || 0,
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
        .not('birth_date', 'is', null)
        .limit(5000);

      // Filter birthdays on the client side
      // Comparar mês/dia por string para evitar conversão UTC->local (bug de fuso em SP)
      const birthdayStudents = allStudents?.filter(student => {
        if (!student.birth_date) return false;
        const [, m, d] = student.birth_date.split("-");
        return m === todayMonth && d === todayDay;
      }) || [];

      // Get students with evaluations that are overdue (more than 7 days)
      const { data: studentsNeedingEvaluation } = await supabase
        .from('students')
        .select('id, name, phone, last_evaluation_date, had_evaluation')
        .or(`last_evaluation_date.lt.${format(sevenDaysAgo, 'yyyy-MM-dd')},and(had_evaluation.eq.false)`)
        .limit(5000);


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
