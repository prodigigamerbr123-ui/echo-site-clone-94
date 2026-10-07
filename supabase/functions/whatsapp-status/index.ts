import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireUser } from "../_shared/auth.ts";
import { getOpenWaQr, getOpenWaState, logoutOpenWa, OpenWaHttpError } from "../_shared/openwa.ts";

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
    let action = "status";
    let includeQr = false;
    try {
      const body = await req.json();
      action = typeof body?.action === "string" ? body.action : "status";
      includeQr = body?.includeQr === true;
    } catch (_) {
      // Status-only callers do not need to send a JSON body.
    }

    const OPENWA_API_URL = Deno.env.get("OPENWA_API_URL");
    const OPENWA_API_KEY = Deno.env.get("OPENWA_API_KEY");

    if (!OPENWA_API_URL) {
      return new Response(
        JSON.stringify({ error: "OpenWA API não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = OPENWA_API_URL.replace(/\/$/, "");

    if (action === "logout") {
      let interrupted = false;
      try {
        await logoutOpenWa(baseUrl, OPENWA_API_KEY);
      } catch (error: any) {
        if (error instanceof OpenWaHttpError) throw error;
        // The OpenWA CLI can close the connection while terminating the session.
        // Treat that as success only after confirming the session is no longer open.
        interrupted = true;
        console.warn("whatsapp-status logout response interrupted:", error?.message || error);
      }

      if (interrupted) {
        let confirmedState: Awaited<ReturnType<typeof getOpenWaState>> = "unknown";
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          confirmedState = await getOpenWaState(baseUrl, OPENWA_API_KEY);
          if (confirmedState !== "unknown") break;
        }

        if (confirmedState === "open") {
          throw new Error("O OpenWA continuou conectado após a tentativa de logout");
        }
        if (confirmedState === "unknown") {
          return new Response(
            JSON.stringify({ error: "Não foi possível confirmar o logout do OpenWA" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          action,
          state: "connecting",
          connected: false,
          instance: "workout",
          provider: "openwa",
          message: "WhatsApp desconectado. O OpenWA será reiniciado e exibirá um novo QR Code para pareamento.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action !== "status") {
      return new Response(
        JSON.stringify({ error: "Ação inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let state = await getOpenWaState(baseUrl, OPENWA_API_KEY);
    let connected = state === "open";
    let qr: string | null = null;
    let qrError: string | null = null;

    if (!connected && includeQr) {
      try {
        qr = await getOpenWaQr(baseUrl, OPENWA_API_KEY, "workout");
        if (qr) state = "connecting";
      } catch (error: any) {
        qrError = error?.message || "Não foi possível obter o QR Code do OpenWA";
        console.warn("whatsapp-status qr error:", qrError);
      }
    }

    connected = state === "open";

    return new Response(
      JSON.stringify({
        state,
        connected,
        instance: "workout",
        provider: "openwa",
        qr,
        qrError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("whatsapp-status error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
