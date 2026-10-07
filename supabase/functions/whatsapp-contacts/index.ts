import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { getOpenWaContacts } from "../_shared/openwa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authFail = await requireUser(req);
  if (authFail) return authFail;

  try {
    const OPENWA_API_URL = Deno.env.get("OPENWA_API_URL");
    const OPENWA_API_KEY = Deno.env.get("OPENWA_API_KEY");

    if (!OPENWA_API_URL) {
      return new Response(
        JSON.stringify({ error: "OpenWA API não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contacts = await getOpenWaContacts(OPENWA_API_URL.replace(/\/$/, ""), OPENWA_API_KEY);
    const normalized = contacts
      .filter((contact: any) => contact?.isWAContact && contact?.isMyContact && !contact?.isMe)
      .map((contact: any) => ({
        id: contact?.id || contact?.phoneNumber || null,
        name: contact?.name || contact?.formattedName || contact?.pushname || null,
        pushname: contact?.pushname || null,
        phone: String(contact?.phoneNumber || contact?.id || "").replace(/@c\.us$/i, ""),
      }));

    return new Response(
      JSON.stringify({ contacts: normalized, total: normalized.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("whatsapp-contacts error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
