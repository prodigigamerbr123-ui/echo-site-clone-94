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
    "20261018230000_student_message_preference.sql",
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


async function enqueue(role: "admin" | "reception" | "evaluator" | "stranger" = "admin", request = crypto.randomUUID()) {
  return (await asUser<{ result: { queued: number; replayed: boolean } }>(role,
    "SELECT enqueue_messages_tx($1,$2::uuid[],'Olá, {nome}',$3::jsonb) AS result",
    [request, [ids.student], JSON.stringify({ kind: "now" })])).rows[0].result;
}
async function queue(status: string, dispatched = false) {
  return (await db.query<{ id: string }>(`INSERT INTO scheduled_messages(student_id,content,scheduled_for,message_type,status,dispatch_started_at)
    VALUES ($1,'Fixture',now()+interval '1 day','manual',$2,CASE WHEN $3 THEN now() END) RETURNING id`,
  [ids.student, status, dispatched])).rows[0].id;
}

describe("student contact preference in PostgreSQL", () => {
  it("defaults existing contact to allowed and preserves active membership when disabled", async () => {
    expect((await db.query("SELECT messages_enabled FROM students")).rows[0]).toEqual({ messages_enabled: true });
    await asUser("reception", "UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]);
    expect((await db.query("SELECT status,messages_enabled FROM students")).rows[0]).toEqual({ status: "active", messages_enabled: false });
    expect((await enqueue()).queued).toBe(0);
    expect((await db.query("SELECT id FROM scheduled_messages")).rows).toHaveLength(0);
  });
  it("cancels pending and unstarted processing but preserves dispatched and failed evidence", async () => {
    const pending = await queue("pending"), processing = await queue("processing"), inFlight = await queue("processing", true), failed = await queue("failed");
    await asUser("admin", "UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]);
    const { rows } = await db.query<{ id: string; status: string }>("SELECT id,status FROM scheduled_messages");
    const statuses = new Map(rows.map(row => [row.id, row.status]));
    expect(statuses.get(pending)).toBe("cancelled"); expect(statuses.get(processing)).toBe("cancelled");
    expect(statuses.get(inFlight)).toBe("processing"); expect(statuses.get(failed)).toBe("failed");
  });
  it("suppresses new service jobs and prevents retrying a failed contact", async () => {
    const failed = await queue("failed");
    await asUser("admin", "UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]);
    await db.query("INSERT INTO scheduled_messages(student_id,content,scheduled_for,message_type) VALUES ($1,'Fixture',now()+interval '1 day','birthday')", [ids.student]);
    const retry = await asUser<{ status: string }>("admin", "UPDATE scheduled_messages SET status='pending',scheduled_for=now()+interval '1 day' WHERE id=$1 RETURNING status", [failed]);
    expect(retry.rows[0].status).toBe("cancelled");
    expect((await db.query("SELECT id FROM scheduled_messages")).rows).toHaveLength(1);
  });
  it("does not restore cancelled messages when contact is enabled again", async () => {
    const pending = await queue("pending");
    await asUser("admin", "UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]);
    await asUser("admin", "UPDATE students SET messages_enabled=true WHERE id=$1", [ids.student]);
    expect((await db.query("SELECT status FROM scheduled_messages WHERE id=$1", [pending])).rows[0]).toEqual({ status: "cancelled" });
    expect((await enqueue()).queued).toBe(1);
  });
  it("keeps enqueue request replay idempotent with the actual zero count", async () => {
    await db.query("UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]);
    const request = crypto.randomUUID();
    expect(await enqueue("admin", request)).toMatchObject({ queued: 0, replayed: false });
    await db.query("UPDATE students SET messages_enabled=true WHERE id=$1", [ids.student]);
    expect(await enqueue("admin", request)).toMatchObject({ queued: 0, replayed: true });
    expect((await db.query("SELECT id FROM scheduled_messages")).rows).toHaveLength(0);
  });
  it("still saves an evaluation and reports zero suppressed reminders", async () => {
    await db.query("UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]);
    const { rows } = await asUser<{ result: { messages_created: number } }>("evaluator", `SELECT mutate_evaluation_tx('create',gen_random_uuid(),$1,now()+interval '1 day',NULL,$2::jsonb) AS result`,
      [ids.student, JSON.stringify([{ message_type: "evaluation_confirmation", content: "Fixture", scheduled_for: new Date(Date.now()+120000).toISOString() }])]);
    expect(rows[0].result.messages_created).toBe(0);
    expect((await db.query("SELECT id FROM evaluations")).rows).toHaveLength(1);
  });
  it("checks the preference again immediately before dispatch, even if cancellation was missed", async () => {
    const id = await queue("processing");
    // Simulates an old queue row racing with preference persistence.
    await db.exec("ALTER TABLE students DISABLE TRIGGER cancel_disabled_student_messages");
    try { await db.query("UPDATE students SET messages_enabled=false WHERE id=$1", [ids.student]); }
    finally { await db.exec("ALTER TABLE students ENABLE TRIGGER cancel_disabled_student_messages"); }
    const token = crypto.randomUUID();
    await db.query("SELECT acquire_whatsapp_delivery_lease($1)", [token]);
    const { rows } = await db.query<{ result: unknown }>("SELECT prepare_scheduled_message_dispatch($1,(SELECT updated_at FROM scheduled_messages WHERE id=$1),$2) AS result", [id,token]);
    expect(rows[0].result).toBeNull();
    expect((await db.query("SELECT status,dispatch_started_at FROM scheduled_messages WHERE id=$1", [id])).rows[0]).toEqual({ status: "cancelled", dispatch_started_at: null });
  });
  it("preserves staff authorization and does not expose the internal evaluation function", async () => {
    for (const role of ["evaluator", "stranger"] as const) {
      await expect(enqueue(role)).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asUser("admin", "SELECT mutate_evaluation_internal_tx('cancel',gen_random_uuid())")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser("stranger", "SELECT mutate_evaluation_tx('create',gen_random_uuid(),$1,now()+interval '1 day')", [ids.student])).rejects.toMatchObject({ code: "42501" });
    expect((await asUser("evaluator", "UPDATE students SET messages_enabled=false WHERE id=$1 RETURNING id", [ids.student])).rows).toHaveLength(0);
  });
  it("omits blocked contact suggestions while retaining student and evaluation statistics", async () => {
    await db.query("UPDATE students SET messages_enabled=false,created_at=now()-interval '30 days',enrollment_date=current_date-30 WHERE id=$1", [ids.student]);
    const { rows } = await asUser<{ result: { actions: unknown[]; stats: { activeStudents: number } } }>("admin", "SELECT get_workout_dashboard() AS result");
    expect(rows[0].result.actions).toHaveLength(0);
    expect(rows[0].result.stats.activeStudents).toBe(1);
  });
});
