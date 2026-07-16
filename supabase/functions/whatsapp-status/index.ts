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
    const EVOLUTION_INSTANCE_TOKEN = Deno.env.get('EVOLUTION_INSTANCE_TOKEN');

    if (!EVOLUTION_API_URL || !EVOLUTION_INSTANCE_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const headers = { apikey: EVOLUTION_INSTANCE_TOKEN, 'Content-Type': 'application/json' };

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body?.action || 'status';

    if (action === 'logout') {
      const r = await fetch(`${baseUrl}/instance/disconnect`, {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      const data = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ success: r.ok, data }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get connection status
    const statusResp = await fetch(`${baseUrl}/instance/status`, { headers });
    const statusText = await statusResp.text();
    console.log(`[instance/status] http=${statusResp.status} body=${statusText.slice(0, 400)}`);
    let statusData: any = {};
    try { statusData = JSON.parse(statusText); } catch (_) {}
    const d = statusData?.data || statusData;
    const connected = !!(d?.Connected && d?.LoggedIn);
    const state = connected ? 'open' : (d?.Connected ? 'connecting' : 'close');

    let qrcode: string | null = null;
    let pairingCode: string | null = null;

    if (!connected || action === 'connect') {
      if (action === 'connect') {
        await fetch(`${baseUrl}/instance/connect`, {
          method: 'POST', headers, body: JSON.stringify({ immediate: true }),
        }).catch(() => {});
      }
      const qrResp = await fetch(`${baseUrl}/instance/qr`, { headers });
      const qrText = await qrResp.text();
      console.log(`[instance/qr] http=${qrResp.status} body=${qrText.slice(0, 200)}`);
      let qrData: any = {};
      try { qrData = JSON.parse(qrText); } catch (_) {}
      qrcode = qrData?.data?.qrcode || qrData?.qrcode || null;
      pairingCode = qrData?.data?.pairingCode || qrData?.pairingCode || null;
    }

    return new Response(
      JSON.stringify({ state, qrcode, pairingCode, instance: d?.Name || null }),
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
