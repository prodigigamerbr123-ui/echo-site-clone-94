
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, params, userConfirmation } = await req.json();
    
    // Verificar se o usuário confirmou a ação
    if (!userConfirmation) {
      return new Response(JSON.stringify({ 
        error: 'Ação não autorizada pelo usuário',
        requiresConfirmation: true,
        actionDescription: getActionDescription(action, params)
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let result;
    
    switch (action) {
      case 'create_student':
        result = await supabase
          .from('students')
          .insert({
            name: params.name,
            phone: params.phone,
            birth_date: params.birth_date
          })
          .select()
          .single();
        break;
        
      case 'schedule_message':
        result = await supabase
          .from('scheduled_messages')
          .insert({
            student_id: params.student_id,
            content: params.content,
            scheduled_for: params.scheduled_for,
            message_type: params.message_type || 'manual'
          })
          .select()
          .single();
        break;
        
      case 'update_student_evaluation':
        result = await supabase
          .from('students')
          .update({
            last_evaluation_date: params.evaluation_date,
            had_evaluation: true
          })
          .eq('id', params.student_id)
          .select()
          .single();
        break;
        
      case 'create_predefined_message':
        result = await supabase
          .from('predefined_messages')
          .insert({
            title: params.title,
            content: params.content
          })
          .select()
          .single();
        break;
        
      case 'get_students_needing_followup':
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        result = await supabase
          .from('students')
          .select('*')
          .lt('created_at', sevenDaysAgo.toISOString())
          .is('last_evaluation_date', null);
        break;
        
      case 'send_whatsapp_message':
        // Buscar dados dos alunos se apenas IDs foram fornecidos
        let students = params.students;
        if (params.student_ids && params.student_ids.length > 0) {
          const { data: studentsData, error: studentsError } = await supabase
            .from('students')
            .select('id, name, phone')
            .in('id', params.student_ids);
            
          if (studentsError) throw studentsError;
          students = studentsData;
        }
        
        // Chamar a função send-whatsapp
        const { data: whatsappResult, error: whatsappError } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            students: students,
            message: params.message
          }
        });
        
        if (whatsappError) throw whatsappError;
        
        result = { data: whatsappResult };
        break;
        
      default:
        throw new Error(`Ação não reconhecida: ${action}`);
    }

    if (result.error) {
      throw result.error;
    }

    return new Response(JSON.stringify({ 
      success: true,
      data: result.data,
      message: getSuccessMessage(action, result.data)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-database-actions function:', error);
    return new Response(JSON.stringify({ 
      error: 'Erro interno do servidor',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getActionDescription(action: string, params: any): string {
  switch (action) {
    case 'create_student':
      return `Criar novo aluno: ${params.name} (${params.phone})`;
    case 'schedule_message':
      return `Agendar mensagem para aluno`;
    case 'update_student_evaluation':
      return `Atualizar data de avaliação do aluno`;
    case 'create_predefined_message':
      return `Criar mensagem pré-definida: ${params.title}`;
    case 'get_students_needing_followup':
      return `Buscar alunos que precisam de acompanhamento`;
    case 'send_whatsapp_message':
      const studentCount = params.students?.length || params.student_ids?.length || 0;
      return `Enviar mensagem via WhatsApp para ${studentCount} aluno(s): "${params.message?.substring(0, 50)}..."`;
    default:
      return `Executar ação: ${action}`;
  }
}

function getSuccessMessage(action: string, data?: any): string {
  switch (action) {
    case 'create_student':
      return 'Aluno criado com sucesso!';
    case 'schedule_message':
      return 'Mensagem agendada com sucesso!';
    case 'update_student_evaluation':
      return 'Avaliação atualizada com sucesso!';
    case 'create_predefined_message':
      return 'Mensagem pré-definida criada com sucesso!';
    case 'get_students_needing_followup':
      return 'Dados obtidos com sucesso!';
    case 'send_whatsapp_message':
      const summary = data?.summary;
      if (summary) {
        return `Mensagens enviadas! ${summary.sent} enviadas com sucesso, ${summary.failed} falharam.`;
      }
      return 'Mensagens enviadas com sucesso!';
    default:
      return 'Ação executada com sucesso!';
  }
}
