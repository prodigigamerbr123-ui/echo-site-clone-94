import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffRole, corsHeaders } from "../_shared/auth.ts";
import { getSupabasePublishableKey } from "../_shared/supabaseEnv.ts";

// Compatibility endpoint: every interactive send now goes through the same queue.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const fail = await requireStaffRole(req, ["admin", "recepcao"]);
  if (fail) return fail;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const recipients = Array.isArray(body.students) ? body.students : [];
    const ids: string[] = [...new Set<string>(recipients.map((student: { id?: unknown } | null) => student?.id))];
    if (!message || message.length > 1000 || !ids.length || ids.length > 500 || ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return json({ error: "Informe uma mensagem de até 1000 caracteres e de 1 a 500 alunos cadastrados" }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getSupabasePublishableKey(), {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    // Client-supplied names/phones are ignored. RLS applies to the selected records.
    const { data: students, error } = await supabase.from("students").select("id,name").in("id", ids);
    if (error) throw error;
    if (!students || students.length !== ids.length) return json({ error: "Aluno não encontrado ou sem permissão" }, 403);
    const now = Date.now();
    const rows = students.map((student, i) => ({
      student_id: student.id, content: message.replace(/\{nome\}/gi, student.name),
      scheduled_for: new Date(now + 60_000 + i * 30_000).toISOString(), message_type: "manual", status: "pending",
    }));
    const insert = await supabase.from("scheduled_messages").insert(rows);
    if (insert.error) throw insert.error;
    return json({ success: true, summary: { total: rows.length, queued: rows.length, sent: 0, failed: 0 } });
  } catch (error) {
    console.error("send-whatsapp enqueue failed", error);
    return json({ error: "Não foi possível enfileirar as mensagens" }, 500);
  }
});
