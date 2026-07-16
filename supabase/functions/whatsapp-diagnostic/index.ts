import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!.replace(/\/$/, "");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
  const INSTANCE = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;

  const url = new URL(req.url);
  const number = url.searchParams.get("number") || "5543999253779";

  const headers = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY };

  const results: Record<string, unknown> = {};

  // 1) Instance connection state
  try {
    const r = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE}`, { headers });
    results.connectionState = { status: r.status, body: await r.text() };
  } catch (e: any) {
    results.connectionState = { error: e?.message };
  }

  // 2) Check if number is on WhatsApp
  try {
    const r = await fetch(`${EVOLUTION_API_URL}/chat/whatsappNumbers/${INSTANCE}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ numbers: [number] }),
    });
    results.whatsappNumbers = { status: r.status, body: await r.text() };
  } catch (e: any) {
    results.whatsappNumbers = { error: e?.message };
  }

  // 3) Fetch instance info
  try {
    const r = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${INSTANCE}`, { headers });
    results.instanceInfo = { status: r.status, body: (await r.text()).slice(0, 2000) };
  } catch (e: any) {
    results.instanceInfo = { error: e?.message };
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
