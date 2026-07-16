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


  // TODO: Evolution GO ainda não expõe endpoint de listagem de contatos compatível.
  // Retornamos lista vazia para não quebrar a UI enquanto o endpoint correto é definido.
  return new Response(
    JSON.stringify({ contacts: [], total: 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
