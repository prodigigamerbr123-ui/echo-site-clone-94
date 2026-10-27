// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ids = {
  admin: "00000000-0000-4000-8000-000000000010", reception: "00000000-0000-4000-8000-000000000011",
  evaluator: "00000000-0000-4000-8000-000000000012", stranger: "00000000-0000-4000-8000-000000000013",
  student: "00000000-0000-4000-8000-000000000020",
};
let db: PGlite;
async function asUser<T = Record<string, unknown>>(role: "admin" | "reception" | "evaluator" | "stranger", sql: string, values: unknown[] = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids[role]]);
  await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false); SET ROLE authenticated");
  try { return await db.query<T>(sql, values); }
  finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SELECT set_config('request.jwt.claim.role','service_role',false)"); }
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO authenticated;
    INSERT INTO auth.users VALUES ('${ids.admin}','admin@admin.com'),('${ids.reception}','reception@test.invalid'),('${ids.evaluator}','evaluator@test.invalid'),('${ids.stranger}','stranger@test.invalid');`);
  const migrations = [
    "20260429000000_recovered_base_schema.sql", "20260430050054_adc29b54-6bc1-45cc-895b-859d81031e2e.sql",
    "20260715123733_85abd805-ada3-46c9-9a21-1bbc28230b9a.sql", "20260715141734_1f957cab-3ab0-4952-8a9d-280896f423ee.sql",
    "20260715144115_ee94ee8a-fcbe-4217-8081-4dff99183de0.sql", "20260715174919_8ae18b93-872b-4810-a09e-0d67b158b49f.sql",
    "20260716001135_a7b256e3-eb46-469e-946f-327e1ff5672a.sql", "20260716184011_b1816ba3-cd14-4054-95d9-35a242f764c2.sql",
    "20260720173525_5ce1ace5-ed78-4ef4-9311-b05aa0369d32.sql", "20260722230830_8f9d7b8f-b14d-48b2-a27d-59eeb3b651f6.sql",
    "20261011010000_stabilize_message_queue.sql", "20261011020000_atomic_evaluation_actions.sql",
    "20261011030000_staff_authorization.sql", "20261018210000_cancel_outdated_payment_reminders.sql",
    "20261018220000_student_plan_history.sql",
    "20261014010000_staff_request_quotas.sql", "20261014020000_atomic_message_enqueue.sql",
    "20261014030000_restrict_direct_queue_inserts.sql", "20261015210000_student_admission.sql",
    "20261018230000_student_message_preference.sql", "20261019000000_evaluation_performed_date.sql",
    "20261026000000_dashboard_active_without_evaluation.sql", "20261027010000_dismiss_reviewed_failures.sql",
  ];
  for (const migration of migrations) {
    await db.exec(readFileSync(resolve("supabase/migrations", migration), "utf8").replace(/CREATE EXTENSION IF NOT EXISTS pg_(cron|net);/g, ""));
  }
  await db.query("INSERT INTO staff_members(user_id,role) VALUES ($1,'recepcao'),($2,'avaliador')", [ids.reception, ids.evaluator]);
}, 60_000);
beforeEach(async () => {
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SELECT set_config('request.jwt.claim.role','service_role',false); TRUNCATE students, message_enqueue_requests, staff_request_quotas CASCADE; UPDATE whatsapp_delivery_lease SET token=NULL, leased_until='-infinity', next_dispatch_at='-infinity'; UPDATE automation_settings SET enabled=true;");
  await db.query("INSERT INTO students(id,name,phone,plan,payment_due_date) VALUES ($1,'Aluno fictício','43999990000','Mensal','2099-01-31')", [ids.student]);
});
afterAll(async () => { await db?.close(); });

async function failedMessage(dispatched = false) {
  return (await db.query<{ id: string }>(
    "INSERT INTO scheduled_messages(student_id,content,scheduled_for,message_type,status,failure_reason,dispatch_started_at) VALUES ($1,'Oi',now()-interval '20 days','manual','failed','WhatsApp não conectado',$2) RETURNING id",
    [ids.student, dispatched ? new Date().toISOString() : null])).rows[0].id;
}

describe("dismiss reviewed failures", () => {
  it("lets the front desk acknowledge failures, keeping the original reason and sending nothing", async () => {
    const id = await failedMessage();
    const result = (await asUser<{ r: { dismissed: number } }>("reception", "SELECT dismiss_failed_messages_tx($1::uuid[]) AS r", [[id]])).rows[0].r;
    expect(result.dismissed).toBe(1);
    const row = (await db.query<{ status: string; failure_reason: string }>("SELECT status, failure_reason FROM scheduled_messages WHERE id=$1", [id])).rows[0];
    expect(row).toEqual({ status: "cancelled", failure_reason: "Falha revisada: WhatsApp não conectado" });
  });

  it("keeps possibly delivered messages for the uncertain-delivery review", async () => {
    const id = await failedMessage(true);
    const result = (await asUser<{ r: { dismissed: number } }>("admin", "SELECT dismiss_failed_messages_tx($1::uuid[]) AS r", [[id]])).rows[0].r;
    expect(result.dismissed).toBe(0);
    expect((await db.query<{ status: string }>("SELECT status FROM scheduled_messages WHERE id=$1", [id])).rows[0].status).toBe("failed");
  });

  it("rejects evaluators and users outside the staff", async () => {
    const id = await failedMessage();
    await expect(asUser("evaluator", "SELECT dismiss_failed_messages_tx($1::uuid[])", [[id]])).rejects.toThrow("Não autorizado");
    await expect(asUser("stranger", "SELECT dismiss_failed_messages_tx($1::uuid[])", [[id]])).rejects.toThrow("Não autorizado");
    expect((await db.query<{ status: string }>("SELECT status FROM scheduled_messages WHERE id=$1", [id])).rows[0].status).toBe("failed");
  });
});
