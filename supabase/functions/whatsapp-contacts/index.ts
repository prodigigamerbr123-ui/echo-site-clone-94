import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { listWhatsAppContacts } from "../_shared/whatsapp.ts";

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
    const result = await listWhatsAppContacts();
    return new Response(
      JSON.stringify({ provider: result.provider, contacts: result.contacts, total: result.contacts.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao listar contatos' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
