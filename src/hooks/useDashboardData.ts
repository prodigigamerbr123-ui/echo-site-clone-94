
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";
import { spDate, spParts, fmtDateISOSP } from "@/lib/spTime";

// Todas as fronteiras de tempo são calculadas em America/Sao_Paulo (UTC-3)
// para bater com daily-automation / daily-briefing / process-scheduled-messages.
export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const p = spParts(now);
      const todayStart = spDate(p.y, p.mo, p.d, 0, 0);
      const todayEnd = spDate(p.y, p.mo, p.d + 1, 0, 0); // início do próximo dia SP
      const monthStart = spDate(p.y, p.mo, 1, 0, 0);
      const monthEnd = spDate(p.y, p.mo + 1, 1, 0, 0);
      // Semana começando na segunda (SP)
      const dow = new Date(Date.UTC(p.y, p.mo, p.d)).getUTCDay(); // 0=dom..6=sab
      const daysFromMon = (dow + 6) % 7;
      const weekStart = spDate(p.y, p.mo, p.d - daysFromMon, 0, 0);
      const weekEnd = spDate(p.y, p.mo, p.d - daysFromMon + 7, 0, 0);

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
      const todayMonth = String(p.mo + 1).padStart(2, "0");
      const todayDay = String(p.d).padStart(2, "0");
      
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

      // Mensalidade: vencidos (payment_due_date < hoje) e vencendo em 3 dias (calendário SP)
      const todayStr = fmtDateISOSP(now);
      const in3DaysStr = fmtDateISOSP(spDate(p.y, p.mo, p.d + 3, 12, 0));

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
      const p = spParts(now);
      const sevenDaysAgo = subDays(now, 7);
      const twentyOneDaysAgo = subDays(now, 21);
      const todayMonth = String(p.mo + 1).padStart(2, "0");
      const todayDay = String(p.d).padStart(2, "0");

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

      // Datas SP (yyyy-MM-dd) para janelas de follow-up
      const sevenAgoStr = fmtDateISOSP(sevenDaysAgo);
      const sixAgoStr = fmtDateISOSP(subDays(now, 6));
      const twentyOneAgoStr = fmtDateISOSP(twentyOneDaysAgo);
      const twentyAgoStr = fmtDateISOSP(subDays(now, 20));

      // Get students with evaluations that are overdue (more than 7 days)
      // Só ativos e sem avaliação futura já agendada (alinha com daily-automation e AgendarAvaliacao)
      const { data: rawEvalCandidates } = await supabase
        .from('students')
        .select('id, name, phone, last_evaluation_date, had_evaluation, status')
        .eq('status', 'active')
        .or(`last_evaluation_date.lt.${sevenAgoStr},and(had_evaluation.eq.false)`)
        .limit(5000);
      const { data: futureEvals } = await supabase
        .from('evaluations')
        .select('student_id')
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString());
      const scheduledSet = new Set((futureEvals || []).map((e: any) => e.student_id));
      const studentsNeedingEvaluation = (rawEvalCandidates || []).filter(
        (s: any) => !scheduledSet.has(s.id),
      );


      // Get students created 7 days ago for first follow-up
      const { data: studentsNeeding7DayFollowUp } = await supabase
        .from('students')
        .select('id, name, phone, created_at')
        .gte('created_at', sevenAgoStr)
        .lt('created_at', sixAgoStr);

      // Get students created 21 days ago for second follow-up
      const { data: studentsNeeding21DayFollowUp } = await supabase
        .from('students')
        .select('id, name, phone, created_at')
        .gte('created_at', twentyOneAgoStr)
        .lt('created_at', twentyAgoStr);

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
