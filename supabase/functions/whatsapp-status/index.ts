import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseEvolutionStatus } from "../_shared/evolution.ts";

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
    const { action = 'status' } = await req.json().catch(() => ({ action: 'status' }));
    if (!['status', 'qr', 'connect', 'logout'].includes(action)) {
      return json({ error: 'Ação inválida' }, 400);
    }

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
    const EVOLUTION_INSTANCE_TOKEN = Deno.env.get('EVOLUTION_INSTANCE_TOKEN');

    if (!EVOLUTION_API_URL || !EVOLUTION_INSTANCE_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const headers = { apikey: EVOLUTION_INSTANCE_TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'WorkoutSaaS/1.0' };

    if (action === 'qr') {
      // Consulta apenas o QR existente; nunca reinicia o pareamento durante o polling.
      const response = await fetch(`${baseUrl}/instance/qr`, {
        headers, signal: AbortSignal.timeout(10000), cache: 'no-store',
      });
      if (!response.ok) {
        if ([404, 409, 425].includes(response.status)) return json({ qrCode: null });
        throw new Error(`Não foi possível obter QR Code (HTTP ${response.status})`);
      }
      const payload = await response.json();
      const qrCode = normalizeQr(payload?.data?.code) ??
        normalizeQr(payload?.data?.qrcode) ??
        normalizeQr(payload?.code) ??
        normalizeQr(payload?.qrcode);
      return json({ qrCode });
    }

    if (action === 'connect') {
      const response = await fetch(`${baseUrl}/instance/status`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Não foi possível verificar a sessão antes de conectar');
      const payload = await response.json();
      const status = parseEvolutionStatus(payload);
      // Ações de conexão são limitadas a instâncias realmente deslogadas.
      if (status.state !== 'close') return json({ state: status.state, started: false });
      if (payload?.data?.loggedIn === true || payload?.data?.LoggedIn === true ||
          payload?.loggedIn === true || payload?.LoggedIn === true) {
        return json({ state: 'connecting', started: false });
      }
      const connect = await fetch(`${baseUrl}/instance/connect`, {
        method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(15000),
      });
      if (!connect.ok) {
        throw new Error(`Não foi possível iniciar o pareamento (HTTP ${connect.status})`);
      }
      return json({ started: true, state: 'connecting' });
    }

    if (action === 'logout') {
      const response = await fetch(`${baseUrl}/instance/logout`, {
        method: 'DELETE', headers, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`Não foi possível desconectar (HTTP ${response.status})`);
      }
      return json({ disconnected: true });
    }

    const statusResp = await fetch(`${baseUrl}/instance/status`, { headers, signal: AbortSignal.timeout(10000) });
    const statusText = await statusResp.text();
    if (!statusResp.ok) {
      throw new Error(`Não foi possível consultar a Evolution (HTTP ${statusResp.status})`);
    }
    const statusData = JSON.parse(statusText);

    return json({ ...parseEvolutionStatus(statusData), dashboardUrl: `${baseUrl}/manager/login` });
  } catch (error: any) {
    console.error('whatsapp-status error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Somente imagens PNG em base64 são devolvidas ao cliente; o código de pareamento
// textual e os tokens da Evolution nunca são encaminhados ao navegador.
function normalizeQr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.startsWith('data:image/png;base64,')
    ? value.slice('data:image/png;base64,'.length)
    : value;
  const base64 = candidate.replace(/\s/g, '');
  return /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length < 500_000
    ? `data:image/png;base64,${base64}`
    : null;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
