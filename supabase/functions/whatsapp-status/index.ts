import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { getWhatsAppStatus } from "../_shared/whatsapp.ts";

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
    const status = await getWhatsAppStatus();

    return new Response(
      JSON.stringify(status),
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
