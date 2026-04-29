
import { supabase } from "@/integrations/supabase/client";

export interface StudentData {
  id: string;
  name: string;
}

export const scheduleAutomaticMessages = async (student: StudentData) => {
  const now = new Date();
  
  const messagesToSchedule = [
    {
      student_id: student.id,
      content: `Olá ${student.name}! Como foi sua primeira semana na academia? Está conseguindo manter a rotina de exercícios? Qualquer dúvida, estamos aqui para ajudar! 💪`,
      scheduled_for: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dias
      message_type: 'daqui_7_dias',
      status: 'pending'
    },
    {
      student_id: student.id,
      content: `Oi ${student.name}! Já se passaram 3 semanas desde que você começou na academia. Como está se sentindo? Notou alguma mudança? Continue firme nos treinos! 🏋️‍♂️`,
      scheduled_for: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString(), // 21 dias
      message_type: 'daqui_21_dias',
      status: 'pending'
    },
    {
      student_id: student.id,
      content: `Parabéns ${student.name}! Você completou mais de um mês na academia! 🎉 Como está sua evolução? Que tal agendar uma nova avaliação física para ver seu progresso?`,
      scheduled_for: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 dias
      message_type: 'daqui_45_dias',
      status: 'pending'
    }
  ];

  try {
    const { error } = await supabase
      .from('scheduled_messages')
      .insert(messagesToSchedule);

    if (error) {
      throw error;
    }

    console.log(`Scheduled ${messagesToSchedule.length} automatic messages for ${student.name}`);
    return true;
  } catch (error) {
    console.error('Error scheduling messages:', error);
    throw error;
  }
};
