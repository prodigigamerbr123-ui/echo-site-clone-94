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

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body?.action || 'status';

    if (action === 'logout') {
      const r = await fetch(`${baseUrl}/instance/logout/${EVOLUTION_INSTANCE_NAME}`, {
        method: 'DELETE', headers,
      });
      const data = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ success: r.ok, data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get connection state
    const stateResp = await fetch(
      `${baseUrl}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`,
      { headers }
    );
    const stateData = await stateResp.json().catch(() => ({}));
    const state = stateData?.instance?.state || stateData?.state || 'unknown';

    let qrcode: string | null = null;
    let pairingCode: string | null = null;

    // If not connected (or explicitly requested), fetch QR code
    if (state !== 'open' || action === 'connect') {
      const connUrl = `${baseUrl}/instance/connect/${EVOLUTION_INSTANCE_NAME}`;
      const connResp = await fetch(connUrl, { headers });
      const connText = await connResp.text();
      console.log(`[connect] status=${connResp.status} body=${connText.slice(0, 500)}`);

      let connData: any = {};
      try { connData = JSON.parse(connText); } catch (_) {}

      // Evolution v1/v2 return slightly different shapes:
      // v2: { pairingCode, code, base64, count }
      // v1: { qrcode: { base64, code } } or { base64 }
      qrcode =
        connData?.base64 ||
        connData?.qrcode?.base64 ||
        connData?.qrcode ||
        connData?.qr ||
        null;
      pairingCode = connData?.pairingCode || connData?.code || null;

      if (!qrcode && !connResp.ok) {
        return new Response(
          JSON.stringify({
            state,
            qrcode: null,
            pairingCode: null,
            instance: EVOLUTION_INSTANCE_NAME,
            error: `Evolution /connect HTTP ${connResp.status}: ${connText.slice(0, 300)}`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ state, qrcode, pairingCode, instance: EVOLUTION_INSTANCE_NAME }),
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
