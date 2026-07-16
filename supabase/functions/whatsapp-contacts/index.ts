import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const headers = { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' };

    // Try POST first
    let resp = await fetch(
      `${baseUrl}/chat/findContacts/${EVOLUTION_INSTANCE_NAME}`,
      { method: 'POST', headers, body: JSON.stringify({ where: {} }) }
    );
    let text = await resp.text();
    console.log(`[findContacts POST] status=${resp.status} bodyLen=${text.length}`);
    let data: any = null;
    try { data = JSON.parse(text); } catch {}

    if (!Array.isArray(data) && !data?.contacts && !data?.data) {
      resp = await fetch(`${baseUrl}/chat/findContacts/${EVOLUTION_INSTANCE_NAME}`, { headers });
      text = await resp.text();
      console.log(`[findContacts GET] status=${resp.status} bodyLen=${text.length}`);
      try { data = JSON.parse(text); } catch {}
    }

    const arr = Array.isArray(data) ? data : (data?.contacts || data?.data || []);
    console.log(`[contacts] raw count=${arr.length}, sample=${JSON.stringify(arr[0] || {}).slice(0, 200)}`);

    const contacts = arr
      .map((c: any) => {
        // Evolution may return number under different fields
        const rawJid = c.id || c.remoteJid || c.jid || c.owner || '';
        const rawNumber = c.number || c.phoneNumber || rawJid.split('@')[0] || '';
        const phone = String(rawNumber).replace(/\D/g, '');
        const name = c.pushName || c.name || c.notify || c.verifiedName || c.profileName || '';
        return { jid: rawJid, phone, name };
      })
      .filter((c: any) => {
        if (!c.phone) return false;
        // Exclude groups, broadcast, status, newsletter
        if (c.jid && (
          c.jid.includes('@g.us') ||
          c.jid.includes('@broadcast') ||
          c.jid.includes('status@') ||
          c.jid.includes('@newsletter') ||
          c.jid.includes('@lid')
        )) return false;
        // Must be a real phone number (8-15 digits)
        if (c.phone.length < 8 || c.phone.length > 15) return false;
        return true;
      })
      .filter((c: any, idx: number, self: any[]) =>
        idx === self.findIndex(x => x.phone === c.phone)
      )
      .sort((a: any, b: any) => (a.name || a.phone).localeCompare(b.name || b.phone));

    console.log(`[contacts] filtered count=${contacts.length}`);

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
