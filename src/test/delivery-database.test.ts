// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let db: PGlite;
const studentId = "00000000-0000-4000-8000-000000000001";
const evaluationId = "00000000-0000-4000-8000-000000000002";
const token = "00000000-0000-4000-8000-000000000003";
async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<{ result: T }>(sql, params);
  return rows[0]?.result;
}
async function insertMessage(type = "manual", evaluation: string | null = null, date = new Date(Date.now() - 60_000).toISOString()) {
  return scalar<string>("INSERT INTO scheduled_messages(student_id,content,scheduled_for,message_type,evaluation_id) VALUES ($1,'Olá',$2,$3,$4) RETURNING id AS result", [studentId, date, type, evaluation]);
}
async function prepare(id: string) {
  await db.query("SELECT acquire_whatsapp_delivery_lease($1)", [token]);
  return scalar<{ message: { id: string } } | null>("SELECT prepare_scheduled_message_dispatch($1,(SELECT updated_at FROM scheduled_messages WHERE id=$1),$2) AS result", [id, token]);
}
async function createEvaluation(messages: unknown[] = [], at = new Date(Date.now() + 86400000).toISOString()) {
  return scalar<{ messages_created: number }>("SELECT mutate_evaluation_tx('create',$1,$2,$3,NULL,$4::jsonb) AS result", [evaluationId, studentId, at, JSON.stringify(messages)]);
}
const reminder = () => ({ message_type: "evaluation_confirmation", content: "Avaliação confirmada", scheduled_for: new Date(Date.now() + 120_000).toISOString() });

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000010'::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;`);
  const files = [
    "20260429000000_recovered_base_schema.sql", "20260430050054_adc29b54-6bc1-45cc-895b-859d81031e2e.sql",
    "20260715123733_85abd805-ada3-46c9-9a21-1bbc28230b9a.sql", "20260715141734_1f957cab-3ab0-4952-8a9d-280896f423ee.sql",
    "20260715144115_ee94ee8a-fcbe-4217-8081-4dff99183de0.sql", "20260715174919_8ae18b93-872b-4810-a09e-0d67b158b49f.sql",
    "20260716001135_a7b256e3-eb46-469e-946f-327e1ff5672a.sql", "20260720173525_5ce1ace5-ed78-4ef4-9311-b05aa0369d32.sql",
    "20260722230830_8f9d7b8f-b14d-48b2-a27d-59eeb3b651f6.sql",
    "20261011010000_stabilize_message_queue.sql", "20261011020000_atomic_evaluation_actions.sql",
  ];
  for (const file of files) {
    const sql = readFileSync(resolve("supabase/migrations", file), "utf8").replace(/CREATE EXTENSION IF NOT EXISTS pg_(cron|net);/g, "");
    await db.exec(sql);
  }
}, 60_000);
beforeEach(async () => {
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false); TRUNCATE students CASCADE; UPDATE whatsapp_delivery_lease SET token=NULL, leased_until='-infinity', next_dispatch_at='-infinity'; UPDATE automation_settings SET enabled=true;");
  await db.query("INSERT INTO students(id,name,phone,status,payment_due_date,birth_date) VALUES ($1,'Aluno fictício','43999999999','active',current_date - 1,(now() AT TIME ZONE 'America/Sao_Paulo')::date)", [studentId]);
});
afterAll(async () => { await db?.close(); });

describe("atomic evaluation actions in PostgreSQL", () => {
  it("rolls back the appointment when any reminder is invalid", async () => {
    await expect(createEvaluation([reminder(), { ...reminder(), content: "" }])).rejects.toThrow("Mensagem automática inválida");
    expect(await scalar<number>("SELECT count(*)::int AS result FROM evaluations")).toBe(0);
    expect(await scalar<number>("SELECT count(*)::int AS result FROM scheduled_messages")).toBe(0);
  });
  it("returns the actual number created and makes a replay idempotent", async () => {
    const when = new Date(Date.now() + 86400000).toISOString();
    expect((await createEvaluation([reminder()], when)).messages_created).toBe(1);
    expect((await createEvaluation([reminder()], when)).messages_created).toBe(0);
    expect(await scalar<number>("SELECT count(*)::int AS result FROM scheduled_messages")).toBe(1);
  });
  it("rejects a second appointment for the same student", async () => {
    await createEvaluation();
    await expect(db.query("SELECT mutate_evaluation_tx('create',gen_random_uuid(),$1,now()+interval '2 days')", [studentId])).rejects.toThrow("já possui avaliação");
  });
  it("rejects duplicated reminder types instead of producing repeated sends", async () => {
    await expect(createEvaluation([reminder(), reminder()])).rejects.toThrow("Mensagem automática inválida");
    expect(await scalar<number>("SELECT count(*)::int AS result FROM evaluations")).toBe(0);
  });
  it("reschedules atomically and binds replacement messages to the new time", async () => {
    await createEvaluation([reminder()]);
    const next = new Date(Date.now() + 2 * 86400000).toISOString();
    await db.query("SELECT mutate_evaluation_tx('reschedule',$1,NULL,$2,NULL,$3::jsonb)", [evaluationId, next, JSON.stringify([reminder()])]);
    expect(await scalar<number>("SELECT count(*)::int AS result FROM scheduled_messages WHERE status='cancelled'")).toBe(1);
    expect(await scalar<boolean>("SELECT sm.source_scheduled_at=e.scheduled_at AS result FROM scheduled_messages sm JOIN evaluations e ON e.id=sm.evaluation_id WHERE sm.status='pending'")).toBe(true);
    const replay = await scalar<{ already_applied: boolean }>("SELECT mutate_evaluation_tx('reschedule',$1,NULL,$2,NULL,$3::jsonb) AS result", [evaluationId, next, JSON.stringify([reminder()])]);
    expect(replay.already_applied).toBe(true);
    expect(await scalar<number>("SELECT count(*)::int AS result FROM scheduled_messages WHERE status='pending'")).toBe(1);
  });
  it("rolls back a reschedule and its cancellations if replacement reminders fail", async () => {
    await createEvaluation([reminder()]);
    const before = await scalar<string>("SELECT scheduled_at::text AS result FROM evaluations WHERE id=$1", [evaluationId]);
    await expect(db.query("SELECT mutate_evaluation_tx('reschedule',$1,NULL,now()+interval '2 days',NULL,$2::jsonb)", [evaluationId, JSON.stringify([{ ...reminder(), content: "" }])])).rejects.toThrow();
    expect(await scalar<string>("SELECT scheduled_at::text AS result FROM evaluations WHERE id=$1", [evaluationId])).toBe(before);
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages LIMIT 1")).toBe("pending");
  });
  it("cancels a claimed reminder before dispatch begins", async () => {
    await createEvaluation();
    const id = await insertMessage("evaluation_confirmation", evaluationId);
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3)");
    await db.query("SELECT mutate_evaluation_tx('cancel',$1)", [evaluationId]);
    expect(await prepare(id)).toBeNull();
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE id=$1", [id])).toBe("cancelled");
  });
  it("keeps the latest student evaluation when closing an older appointment", async () => {
    await db.query("INSERT INTO evaluations(id,student_id,scheduled_at) VALUES ($1,$2,now()-interval '20 days')", [evaluationId, studentId]);
    await db.exec("UPDATE students SET last_evaluation_date=current_date-1");
    await db.query("SELECT mutate_evaluation_tx('completed',$1)", [evaluationId]);
    expect(await scalar<boolean>("SELECT last_evaluation_date=current_date-1 AS result FROM students")).toBe(true);
  });
});

describe("queue lifecycle in PostgreSQL", () => {
  it("allows only one worker lease and does not let another token release it", async () => {
    expect(await scalar<boolean>("SELECT acquire_whatsapp_delivery_lease($1) AS result", [token])).toBe(true);
    expect(await scalar<boolean>("SELECT acquire_whatsapp_delivery_lease(gen_random_uuid()) AS result")).toBe(false);
    await db.exec("SELECT release_whatsapp_delivery_lease(gen_random_uuid())");
    expect(await scalar<boolean>("SELECT acquire_whatsapp_delivery_lease(gen_random_uuid()) AS result")).toBe(false);
  });
  it("expires old birthday messages rather than sending them on a later day", async () => {
    const id = await insertMessage("birthday", null, new Date(Date.now() - 3 * 86400000).toISOString());
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3)");
    expect(await prepare(id)).toBeNull();
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE id=$1", [id])).toBe("cancelled");
  });
  it("preserves the global spacing when one worker releases its lease", async () => {
    const first = await insertMessage();
    const second = await insertMessage();
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3)");
    expect(await prepare(first)).not.toBeNull();
    await db.query("SELECT finish_scheduled_message_dispatch($1,'Olá','fake-id')", [first]);
    await db.query("SELECT release_whatsapp_delivery_lease($1)", [token]);
    expect(await prepare(second)).toBeNull();
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE id=$1", [second])).toBe("processing");
  });
  it("rechecks a switched-off automation after claiming", async () => {
    const id = await insertMessage("birthday");
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3); UPDATE automation_settings SET enabled=false WHERE key='birthday'");
    expect(await prepare(id)).toBeNull();
  });
  it("cancels a payment reminder when its due date changes", async () => {
    const id = await insertMessage("payment_reminder_due");
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3); UPDATE students SET payment_due_date=current_date+30");
    expect(await prepare(id)).toBeNull();
  });
  it("preserves an in-flight send when cancellation arrives after dispatch begins", async () => {
    await createEvaluation();
    const id = await insertMessage("evaluation_confirmation", evaluationId);
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3)");
    expect(await prepare(id)).not.toBeNull();
    const result = await scalar<{ in_flight: number }>("SELECT mutate_evaluation_tx('cancel',$1) AS result", [evaluationId]);
    expect(result.in_flight).toBe(1);
    await db.query("SELECT finish_scheduled_message_dispatch($1,'Olá','provider-id')", [id]);
    await db.query("SELECT finish_scheduled_message_dispatch($1,'Olá','provider-id')", [id]);
    expect(await scalar<number>("SELECT count(*)::int AS result FROM messages")).toBe(1);
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE id=$1", [id])).toBe("sent");
  });
  it("rolls back the sent state if history cannot be persisted", async () => {
    const id = await insertMessage();
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3)");
    await prepare(id);
    await expect(db.query("SELECT finish_scheduled_message_dispatch($1,NULL,'provider-id')", [id])).rejects.toThrow();
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE id=$1", [id])).toBe("processing");
  });
  it("blocks edits from an authenticated client while processing", async () => {
    const id = await insertMessage();
    await db.exec("SELECT * FROM claim_due_scheduled_messages(3); SELECT set_config('request.jwt.claim.role','authenticated',false)");
    await expect(db.query("UPDATE scheduled_messages SET status='pending' WHERE id=$1", [id])).rejects.toThrow("processamento");
  });
  it("only requeues stuck items that never began dispatch", async () => {
    await db.query("INSERT INTO scheduled_messages(student_id,content,scheduled_for,status,updated_at,dispatch_started_at) VALUES ($1,'Não iniciado',now(),'processing',now()-interval '20 minutes',NULL),($1,'Incerto',now(),'processing',now()-interval '20 minutes',now()-interval '20 minutes')", [studentId]);
    await db.exec("SELECT reset_stuck_scheduled_messages()");
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE content='Não iniciado'")).toBe("pending");
    expect(await scalar<string>("SELECT status AS result FROM scheduled_messages WHERE content='Incerto'")).toBe("failed");
  });
  it("cancels all occurrences in a materialized series without deleting history", async () => {
    const root = await insertMessage();
    const second = await insertMessage("recurring");
    await db.query("UPDATE scheduled_messages SET recurrence_parent_id=$1 WHERE id=ANY($2::uuid[])", [root, [root, second]]);
    const result = await scalar<{ cancelled: number }>("SELECT cancel_scheduled_messages_tx($1::uuid[],true) AS result", [[second]]);
    expect(result.cancelled).toBe(2);
    expect(await scalar<number>("SELECT count(*)::int AS result FROM scheduled_messages")).toBe(2);
  });
  it("denies the anonymous role access to the dispatcher RPC", async () => {
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT acquire_whatsapp_delivery_lease($1)", [token])).rejects.toThrow("permission denied");
  });
});
