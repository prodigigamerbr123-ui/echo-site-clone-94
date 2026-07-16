import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatPhone } from "../_shared/phone.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  students: Array<{ id: string; name: string; phone: string }>;
  message: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authFail = await requireUser(req);
  if (authFail) return authFail;


  try {
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const EVOLUTION_INSTANCE_NAME = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const { students, message }: SendMessageRequest = await req.json();

    if (!students?.length) {
      return new Response(JSON.stringify({ error: 'No students provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'No message provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];
    const messagesToSave: any[] = [];

    for (const student of students) {
      const phoneCheck = formatPhone(student.phone);

      if (!phoneCheck.ok) {
        results.push({
          studentId: student.id,
          studentName: student.name,
          phone: student.phone,
          status: 'failed',
          error: phoneCheck.reason,
        });
        messagesToSave.push({
          student_id: student.id,
          content: message,
          status: 'failed',
        });
        continue;
      }

      try {
        const resp = await fetch(
          `${baseUrl}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ number: phoneCheck.number, text: message }),
          }
        );
        const data = await resp.json();

        if (resp.ok) {
          results.push({
            studentId: student.id, studentName: student.name, phone: student.phone,
            status: 'sent', messageId: data?.key?.id ?? null,
          });
          messagesToSave.push({ student_id: student.id, content: message, status: 'sent' });
        } else {
          results.push({
            studentId: student.id, studentName: student.name, phone: student.phone,
            status: 'failed', error: data?.message || data?.error || `HTTP ${resp.status}`,
          });
          messagesToSave.push({ student_id: student.id, content: message, status: 'failed' });
        }
      } catch (err: any) {
        results.push({
          studentId: student.id, studentName: student.name, phone: student.phone,
          status: 'failed', error: err?.message || 'Unknown error',
        });
        messagesToSave.push({ student_id: student.id, content: message, status: 'failed' });
      }
    }

    if (messagesToSave.length > 0) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { error: dbError } = await supabase.from('messages').insert(messagesToSave);
      if (dbError) console.error('DB insert error:', dbError);
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return new Response(
      JSON.stringify({ success: true, results, summary: { total: students.length, sent, failed } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-whatsapp:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
