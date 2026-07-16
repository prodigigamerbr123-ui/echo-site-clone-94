import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import {
  fetchEvolutionInstances,
  getEvolutionInstance,
  summarizeWhatsAppConnection,
} from "../_shared/evolution.ts";

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

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body?.action || 'status';

    if (action === 'logout') {
      const r = await fetch(`${baseUrl}/instance/logout/${EVOLUTION_INSTANCE_NAME}`, {
        method: 'DELETE', headers,
      });
      const data = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ success: r.ok, data, state: 'close', connected: false }), {
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

    // List instances to detect stale sessions that still report state=open.
    const { status: listStatus, instances } = await fetchEvolutionInstances(baseUrl, headers);
    const instanceInfo = getEvolutionInstance(instances, EVOLUTION_INSTANCE_NAME);
    const connection = summarizeWhatsAppConnection(state, instanceInfo);
    console.log(`[fetchInstances] status=${listStatus} count=${instances.length}`);

    // If not connected (or explicitly requested), fetch QR code
    if (connection.effectiveState !== 'open' || action === 'connect') {
      // Evolution only emits a fresh QR when the instance is NOT "open".
      // If the raw state is still open (stale session or forced reconnect),
      // logout first so /instance/connect returns a new QR.
      if (state === 'open') {
        const logoutResp = await fetch(
          `${baseUrl}/instance/logout/${EVOLUTION_INSTANCE_NAME}`,
          { method: 'DELETE', headers },
        );
        console.log(`[pre-connect logout] status=${logoutResp.status}`);
        // small delay to let Evolution reset the socket
        await new Promise((r) => setTimeout(r, 800));
      }

      const connUrl = `${baseUrl}/instance/connect/${EVOLUTION_INSTANCE_NAME}`;

      // Try GET first
      let connResp = await fetch(connUrl, { method: 'GET', headers });
      let connText = await connResp.text();
      console.log(`[connect GET] status=${connResp.status} body=${connText.slice(0, 500)}`);

      let connData: any = {};
      try { connData = JSON.parse(connText); } catch (_) {}

      // If empty response, try POST
      if (!connData?.base64 && !connData?.qrcode && !connData?.code && !connData?.pairingCode) {
        connResp = await fetch(connUrl, { method: 'POST', headers, body: JSON.stringify({}) });
        connText = await connResp.text();
        console.log(`[connect POST] status=${connResp.status} body=${connText.slice(0, 500)}`);
        try { connData = JSON.parse(connText); } catch (_) {}
      }

      qrcode =
        connData?.base64 ||
        connData?.qrcode?.base64 ||
        connData?.qrcode ||
        connData?.qr ||
        null;
      pairingCode = connData?.pairingCode || connData?.code || null;

      // If we forced a logout, reflect the new state to the client
      if (state === 'open') {
        connection.effectiveState = 'close';
        connection.connected = false;
      }
    }

    return new Response(
      JSON.stringify({
        state: connection.effectiveState,
        connected: connection.connected,
        staleSession: connection.staleSession,
        disconnectionReason: connection.disconnectionReason,
        qrcode,
        pairingCode,
        instance: EVOLUTION_INSTANCE_NAME,
      }),
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
