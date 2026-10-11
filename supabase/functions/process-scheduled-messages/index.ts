import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../_shared/database.types.ts";
import { formatPhone } from "../_shared/phone.ts";
import { sendEvolutionText, getEvolutionState } from "../_shared/evolution.ts";
import { requireCronSecret, corsHeaders } from "../_shared/auth.ts";
import { getSupabaseSecretKey } from "../_shared/supabaseEnv.ts";

// Three sends fit within a short lease even with status/send timeouts and spacing.
const MAX_PER_RUN = 3;
const MAX_RETRIES = 3;
const RETRY_DELAY_MINUTES = 5;
type Message = Database["public"]["Tables"]["scheduled_messages"]["Row"];
type Prepared = { message: Message; student: { id: string; name: string; phone: string } };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cronFail = requireCronSecret(req);
  if (cronFail) return cronFail;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const instanceToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
  if (!baseUrl || !instanceToken) return json({ error: "Evolution API não configurada" }, 500);
  const supabase = createClient<Database>(Deno.env.get("SUPABASE_URL")!, getSupabaseSecretKey());
  const leaseToken = crypto.randomUUID();
  let leased = false;
  let claimedIds: string[] = [];
  const started = Date.now();
  const counts = { processed: 0, sent: 0, failed: 0, retried: 0, uncertain: 0, skipped: 0 };
  try {
    const lease = await supabase.rpc("acquire_whatsapp_delivery_lease", { _token: leaseToken });
    if (lease.error) throw lease.error;
    if (!lease.data) return json({ ...counts, paused: "worker_already_running" });
    leased = true;
    // A disconnected instance pauses the queue rather than burning retry attempts.
    if (await getEvolutionState(baseUrl, instanceToken) !== "open") {
      return json({ ...counts, paused: "whatsapp_unavailable" });
    }
    const reset = await supabase.rpc("reset_stuck_scheduled_messages");
    if (reset.error) throw reset.error;
    const claim = await supabase.rpc("claim_due_scheduled_messages", { _limit: MAX_PER_RUN });
    if (claim.error) throw claim.error;
    const claimed = claim.data ?? [];
    claimedIds = claimed.map((m) => m.id);
    for (let i = 0; i < claimed.length; i++) {
      const item = claimed[i];
      // Release items never handed to the provider when the invocation budget runs out.
      if (Date.now() - started > 85_000) break;
      if (i > 0) await sleep(5000 + Math.floor(Math.random() * 10001));
      const prepared = await supabase.rpc("prepare_scheduled_message_dispatch", {
        _id: item.id, _expected_updated_at: item.updated_at, _lease_token: leaseToken,
      });
      if (prepared.error) throw prepared.error;
      counts.processed++;
      if (!prepared.data) { counts.skipped++; continue; }
      const { message: msg, student } = prepared.data as unknown as Prepared;
      const phone = formatPhone(student.phone);
      if (!phone.ok) {
        const result = await supabase.from("scheduled_messages").update({
          status: "failed", dispatch_started_at: null, failure_reason: "Telefone inválido: " + phone.reason,
        }).eq("id", msg.id).eq("status", "processing");
        if (result.error) throw result.error;
        counts.failed++;
        continue;
      }
      const text = msg.content.replace(/\{nome\}/gi, student.name.trim().split(/\s+/)[0] || "");
      try {
        const result = await sendEvolutionText({ baseUrl, instanceToken, number: phone.number, text });
        if (result.ok) {
          const finish = await supabase.rpc("finish_scheduled_message_dispatch", {
            _id: msg.id, _content: text, _provider_message_id: result.messageId!,
          });
          if (finish.error) throw new Error("Provedor aceitou, mas o registro falhou: " + finish.error.message);
          counts.sent++;
        } else if (result.uncertain) {
          throw new Error(result.reason || "Resposta de envio incerta");
        } else {
          const canRetry = msg.retry_count < MAX_RETRIES;
          const failure = await supabase.from("scheduled_messages").update({
            status: canRetry ? "pending" : "failed", dispatch_started_at: null,
            retry_count: msg.retry_count + (canRetry ? 1 : 0),
            scheduled_for: canRetry ? new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000).toISOString() : msg.scheduled_for,
            failure_reason: (result.reason || "Envio rejeitado").slice(0, 250),
          }).eq("id", msg.id).eq("status", "processing");
          if (failure.error) throw failure.error;
          if (canRetry) counts.retried++; else counts.failed++;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        // Never automatically resend after the network may have accepted the send.
        const uncertain = await supabase.from("scheduled_messages").update({
          status: "failed", failure_reason: ("Entrega incerta: " + reason + ". Confira no WhatsApp antes de reenviar.").slice(0, 250),
        }).eq("id", msg.id).eq("status", "processing");
        if (uncertain.error) console.error("Falha registrando entrega incerta", msg.id, uncertain.error.message);
        counts.uncertain++;
      }
    }
    return json(counts);
  } catch (error) {
    console.error("process-scheduled-messages", error);
    return json({ error: error instanceof Error ? error.message : String(error), ...counts }, 500);
  } finally {
    if (leased) {
      // Only release claimed items for which no provider call was started.
      // An interrupted dispatch stays uncertain for manual reconciliation.
      if (claimedIds.length) {
        const released = await supabase.from("scheduled_messages").update({ status: "pending" })
          .in("id", claimedIds).eq("status", "processing").is("dispatch_started_at", null);
        if (released.error) console.error("Falha liberando itens não iniciados", released.error.message);
      }
      const release = await supabase.rpc("release_whatsapp_delivery_lease", { _token: leaseToken });
      if (release.error) console.error("Falha liberando lease", release.error.message);
    }
  }
});
