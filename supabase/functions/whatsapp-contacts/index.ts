import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const headers = { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' };

    // Try the chat/findContacts endpoint (Evolution v2)
    let resp = await fetch(
      `${baseUrl}/chat/findContacts/${EVOLUTION_INSTANCE_NAME}`,
      { method: 'POST', headers, body: JSON.stringify({ where: {} }) }
    );
    let text = await resp.text();
    console.log(`[findContacts POST] status=${resp.status} bodyLen=${text.length}`);
    let data: any = null;
    try { data = JSON.parse(text); } catch {}

    // Fallback: GET
    if (!Array.isArray(data)) {
      resp = await fetch(`${baseUrl}/chat/findContacts/${EVOLUTION_INSTANCE_NAME}`, { headers });
      text = await resp.text();
      console.log(`[findContacts GET] status=${resp.status} bodyLen=${text.length}`);
      try { data = JSON.parse(text); } catch {}
    }

    const arr = Array.isArray(data) ? data : (data?.contacts || data?.data || []);

    const contacts = arr
      .map((c: any) => {
        const jid = c.id || c.remoteJid || c.jid || '';
        const phone = jid.split('@')[0]?.replace(/\D/g, '') || '';
        const name = c.pushName || c.name || c.notify || c.verifiedName || '';
        return { jid, phone, name };
      })
      .filter((c: any) => c.phone && !c.jid.includes('@g.us')) // exclude groups
      .filter((c: any, idx: number, self: any[]) =>
        idx === self.findIndex(x => x.phone === c.phone)
      )
      .sort((a: any, b: any) => (a.name || a.phone).localeCompare(b.name || b.phone));

    return new Response(
      JSON.stringify({ contacts, total: contacts.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('whatsapp-contacts error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
