import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (!p.startsWith('55')) p = '55' + p;
  return p;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
    const EVOLUTION_INSTANCE_NAME = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return new Response(JSON.stringify({ error: 'Evolution API não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Pega mensagens pending cuja data já passou
    const { data: due, error } = await supabase
      .from('scheduled_messages')
      .select('id, content, student_id, students(name, phone)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50);

    if (error) throw error;

    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No due messages' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    let sent = 0, failed = 0;
    const messagesToInsert: any[] = [];

    for (const msg of due as any[]) {
      const phone = msg.students?.phone;
      if (!phone) {
        await supabase.from('scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
        failed++;
        continue;
      }
      try {
        const resp = await fetch(`${baseUrl}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
          body: JSON.stringify({ number: formatPhone(phone), text: msg.content }),
        });
        if (resp.ok) {
          await supabase
            .from('scheduled_messages')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', msg.id);
          messagesToInsert.push({ student_id: msg.student_id, content: msg.content, status: 'sent' });
          sent++;
        } else {
          const txt = await resp.text();
          console.error(`Failed to send ${msg.id}:`, txt);
          await supabase.from('scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
          failed++;
        }
      } catch (err) {
        console.error(`Error sending ${msg.id}:`, err);
        await supabase.from('scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
        failed++;
      }
    }

    if (messagesToInsert.length > 0) {
      await supabase.from('messages').insert(messagesToInsert);
    }

    return new Response(JSON.stringify({ processed: due.length, sent, failed }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('process-scheduled-messages error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
