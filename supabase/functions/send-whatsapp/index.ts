import { record } from "../_shared/contracts.ts";
import { enqueueResult } from "../_shared/messageQueueContracts.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffRole, corsHeaders } from "../_shared/auth.ts";
import { inputErrorResponse, readJsonObject } from "../_shared/httpInput.ts";
import { getSupabasePublishableKey } from "../_shared/supabaseEnv.ts";

// Compatibility endpoint: every interactive send now goes through the same queue.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const fail = await requireStaffRole(req, ["admin", "recepcao"]);
  if (fail) return fail;
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
  try {
    const body = await readJsonObject(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const recipients = Array.isArray(body.students) ? body.students : [];
    const ids = [...new Set(recipients.map((student: unknown) => record(student).id))];
    if (!message || message.length > 1000 || !ids.length || ids.length > 500 || !ids.every((id): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return json({ error: "Informe uma mensagem de até 1000 caracteres e de 1 a 500 alunos cadastrados" }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getSupabasePublishableKey(), {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const requestId = body.request_id;
    if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      return json({ error: "Identificador da solicitação obrigatório" }, 400);
    }
    const { data, error } = await supabase.rpc("enqueue_messages_tx", {
      _request_id: requestId, _student_ids: ids, _content: message, _schedule: { kind: "now" },
    });
    if (error) {
      if (error.code === "PT429") {
        const seconds = Number(error.details);
        const retryAfter = Number.isInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : 600;
        return json({ error: "Limite de envios atingido. Aguarde e tente novamente.", retryAfter }, 429, { "Retry-After": String(retryAfter) });
      }
      if (["22023", "22007", "22008"].includes(error.code)) return json({ error: "Alunos ou agendamento inválidos" }, 400);
      return json({ error: "Não foi possível enfileirar as mensagens" }, 503);
    }
    const result = enqueueResult(data);
    return json({ success: true, request_id: result.requestId, replayed: result.replayed,
      summary: { total: result.queued, queued: result.queued, sent: 0, failed: 0 } });
  } catch (error) {
    const invalid = inputErrorResponse(error, corsHeaders);
    if (invalid) return invalid;
    console.error("send-whatsapp enqueue failed", error);
    return json({ error: "Não foi possível enfileirar as mensagens" }, 500);
  }
});
