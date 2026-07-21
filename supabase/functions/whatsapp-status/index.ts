import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authFail = await requireUser(req);
  if (authFail) return authFail;


  try {
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_INSTANCE_TOKEN = Deno.env.get('EVOLUTION_INSTANCE_TOKEN');

    if (!EVOLUTION_API_URL || !EVOLUTION_INSTANCE_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const headers = { apikey: EVOLUTION_INSTANCE_TOKEN, 'Content-Type': 'application/json' };

    // Somente consulta status. Esta função NÃO deve chamar connect, QR ou disconnect.
    // O QR Code e qualquer reconexão ficam exclusivamente no painel da Evolution.
    const statusResp = await fetch(`${baseUrl}/instance/status`, { headers });
    const statusText = await statusResp.text();
    console.log(`[instance/status] http=${statusResp.status} body=${statusText.slice(0, 400)}`);
    let statusData: any = {};
    try { statusData = JSON.parse(statusText); } catch (_) {}
    const d = statusData?.data || statusData;
    const connected = !!(d?.Connected && d?.LoggedIn);
    const state = connected ? 'open' : (d?.Connected ? 'connecting' : 'close');

    return new Response(
      JSON.stringify({ state, connected, instance: d?.Name || null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('whatsapp-status error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
