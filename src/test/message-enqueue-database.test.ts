// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ids = {
  admin: "00000000-0000-4000-8000-000000000010",
  reception: "00000000-0000-4000-8000-000000000011",
  evaluator: "00000000-0000-4000-8000-000000000012",
  stranger: "00000000-0000-4000-8000-000000000013",
  student: "00000000-0000-4000-8000-000000000020",
};

let db: PGlite;

async function asUser<T = Record<string, unknown>>(
  user: keyof Pick<typeof ids, "admin" | "reception" | "evaluator" | "stranger">,
  sql: string,
  params: unknown[] = [],
) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids[user]]);
  await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false); SET ROLE authenticated;");
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false);");
  }
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated;
    INSERT INTO auth.users(id,email) VALUES
      ('${ids.admin}','admin@admin.com'),
      ('${ids.reception}','reception@test.invalid'),
      ('${ids.evaluator}','evaluator@test.invalid'),
      ('${ids.stranger}','stranger@test.invalid');
  `);
  const migrations = [
    "20260429000000_recovered_base_schema.sql", "20260430050054_adc29b54-6bc1-45cc-895b-859d81031e2e.sql",
    "20260715123733_85abd805-ada3-46c9-9a21-1bbc28230b9a.sql", "20260715141734_1f957cab-3ab0-4952-8a9d-280896f423ee.sql",
    "20260715144115_ee94ee8a-fcbe-4217-8081-4dff99183de0.sql", "20260715174919_8ae18b93-872b-4810-a09e-0d67b158b49f.sql",
    "20260716001135_a7b256e3-eb46-469e-946f-327e1ff5672a.sql", "20260716184011_b1816ba3-cd14-4054-95d9-35a242f764c2.sql",
    "20260720173525_5ce1ace5-ed78-4ef4-9311-b05aa0369d32.sql",
    "20260722230830_8f9d7b8f-b14d-48b2-a27d-59eeb3b651f6.sql",
    "20261011010000_stabilize_message_queue.sql", "20261011020000_atomic_evaluation_actions.sql",
  ];
  for (const name of migrations) {
    const sql = readFileSync(resolve("supabase/migrations", name), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pg_(cron|net);/g, "");
    await db.exec(sql);
  }
  // Existing history must receive a non-null owner at migration time.
  await db.exec("INSERT INTO ai_conversations(title) VALUES ('Conversa anterior')");
  await db.exec(readFileSync(resolve("supabase/migrations/20261011030000_staff_authorization.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261012010000_persist_ai_confirmations.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261013010000_automation_run_history.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261013020000_dashboard_snapshot.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261013030000_durable_ai_chat.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261014010000_staff_request_quotas.sql"), "utf8"));
  await db.query("INSERT INTO staff_members(user_id,role) VALUES ($1,'recepcao'),($2,'avaliador')", [ids.reception, ids.evaluator]);
  await db.query("INSERT INTO students(id,name,phone,status) VALUES ($1,'Aluno fictício','43999999999','active')", [ids.student]);
  await db.exec(readFileSync(resolve("supabase/migrations/20261014020000_atomic_message_enqueue.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261014030000_restrict_direct_queue_inserts.sql"), "utf8"));
}, 60_000);

afterAll(async () => { await db?.close(); });


beforeEach(async () => {
  await db.exec("TRUNCATE message_enqueue_requests, scheduled_messages, staff_request_quotas CASCADE");
});
const requestId = "00000000-0000-4000-8000-000000000099";
const intent = { kind: "custom", date: "2090-02-28", time: "10:00", intervals: [] };
async function enqueue(schedule: unknown = intent, content = "Olá {nome}", studentIds = [ids.student], key = requestId, user: "admin" | "reception" | "evaluator" | "stranger" = "admin") {
  const result = await asUser<{ result: { queued: number; replayed: boolean } }>(user,
    "SELECT enqueue_messages_tx($1,$2::uuid[],$3,$4::jsonb) AS result", [key,studentIds,content,JSON.stringify(schedule)]);
  return result.rows[0].result;
}
async function rows() {
  return (await db.query<{ id: string; content: string; scheduled_for: string; message_type: string; recurrence_parent_id: string | null }>(
    "SELECT * FROM scheduled_messages ORDER BY scheduled_for,id")).rows;
}
describe("server-owned message batches", () => {
  it("denies direct INSERT while preserving evaluation transactions", async () => {
    await expect(asUser("admin", "INSERT INTO scheduled_messages(student_id,content,scheduled_for) VALUES ($1,'Bypass',now()+interval '1 day')", [ids.student])).rejects.toMatchObject({ code: "42501" });
    const result = await asUser<{ result: { messages_created: number } }>("admin", `SELECT mutate_evaluation_tx('create',gen_random_uuid(),$1,now()+interval '20 days',NULL,
      jsonb_build_array(jsonb_build_object('content','Confirmação','scheduled_for',now()+interval '1 day','message_type','evaluation_confirmation'))) AS result`,[ids.student]);
    expect(result.rows[0].result.messages_created).toBe(1);
    await db.exec("DELETE FROM evaluations");
  });
  it("resolves the registered name and writes the complete batch", async () => {
    expect(await enqueue()).toMatchObject({ queued: 1, replayed: false });
    const messages = await rows();
    expect(messages[0].content).toBe("Olá Aluno fictício");
    expect(new Date(messages[0].scheduled_for).toISOString()).toBe("2090-02-28T13:00:00.000Z");
  });
  it("replays the stored outcome even after delivery or cancellation", async () => {
    await enqueue();
    await db.exec("UPDATE scheduled_messages SET status='sent', sent_at=now()");
    expect(await enqueue()).toMatchObject({ queued: 1, replayed: true });
    expect(await rows()).toHaveLength(1);
    expect((await db.query<{ n: number }>("SELECT request_count AS n FROM staff_request_quotas WHERE window_seconds=600")).rows[0].n).toBe(1);
  });
  it("rejects reusing a key for a different payload", async () => {
    await enqueue();
    await expect(enqueue(intent, "Outra mensagem")).rejects.toMatchObject({ code: "22023" });
    expect(await rows()).toHaveLength(1);
  });
  it("isolates idempotency keys by authenticated account", async () => {
    await enqueue();
    expect(await enqueue(intent, "Olá", [ids.student], requestId, "reception")).toMatchObject({ replayed: false });
    expect(await rows()).toHaveLength(2);
  });
  it.each(["evaluator", "stranger"] as const)("denies %s", async user => {
    await expect(enqueue(intent, "Oi", [ids.student], requestId, user)).rejects.toMatchObject({ code: "42501" });
  });
  it("does not expose the ledger or function to anonymous callers", async () => {
    await expect(asUser("admin", "SELECT * FROM message_enqueue_requests")).rejects.toMatchObject({ code: "42501" });
    await db.exec("SET ROLE anon");
    try { await expect(db.query("SELECT enqueue_messages_tx(gen_random_uuid(),ARRAY[]::uuid[],'Oi','{}')")).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("RESET ROLE"); }
  });
  it("rolls back every row when any student is missing", async () => {
    await expect(enqueue(intent, "Oi", [ids.student, requestId])).rejects.toThrow("Aluno não encontrado");
    expect(await rows()).toHaveLength(0);
    expect((await db.query("SELECT * FROM message_enqueue_requests")).rows).toHaveLength(0);
  });
  it.each(["", "   ", "\n\t", "x".repeat(1001)])("rejects empty or oversized content", async content => {
    await expect(enqueue(intent,content)).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });
  it("rejects duplicate recipients", async () => {
    await expect(enqueue(intent, "Oi", [ids.student, ids.student])).rejects.toThrow("repetidos");
  });
  it.each([{ ...intent, date: "2090-02-31" }, { ...intent, time: "24:00" },
    { ...intent, date: "2020-01-01" }, { ...intent, intervals: [{ days: 0, count: 4 }] },
    { ...intent, intervals: [{ days: 7, count: 53 }] }, { ...intent, intervals: [{ days: "7", count: 4 }] },
    { ...intent, intervals: [{ days: 1.5, count: 2 }] }, { kind: "quick", when: "later", repeat: false, days: { days7: false, days21: false, days45: false }, time: "10:00" },
    { kind: "at", scheduled_for: "2090-01-01T12:00:00", message_type: "manual" },
    { kind: "at", scheduled_for: "2090-01-01T12:00:00Z", message_type: "evaluation_confirmation" }])("rejects invalid schedule %j", async schedule => {
    await expect(enqueue(schedule)).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });
  it("deduplicates overlapping recurrence dates and links a single root", async () => {
    expect(await enqueue({ ...intent, intervals: [{ days: 7, count: 4 }, { days: 14, count: 2 }] })).toMatchObject({ queued: 5 });
    const messages = await rows();
    expect(new Set(messages.map(row => row.id)).size).toBe(5);
    expect(messages.every(row => row.recurrence_parent_id === messages[0].id)).toBe(true);
  });
  it("gives quick presets independent IDs", async () => {
    expect(await enqueue({ kind: "quick", when: "later", repeat: false, time: "10:00",
      days: { days7: true, days21: true, days45: true } })).toMatchObject({ queued: 3 });
    expect(new Set((await rows()).map(row => row.id)).size).toBe(3);
  });
  it("retains name characters literally in regex substitution", async () => {
    await db.query("UPDATE students SET name=$1 WHERE id=$2", ["Ana "+String.fromCharCode(92)+"1 $&",ids.student]);
    try {
      await enqueue();
      expect((await rows())[0].content).toBe("Olá Ana "+String.fromCharCode(92)+"1 $&");
    } finally { await db.query("UPDATE students SET name='Aluno fictício' WHERE id=$1",[ids.student]); }
  });
  it("atomically rejects oversized personalized messages", async () => {
    await expect(enqueue(intent, "x".repeat(990)+"{nome}")).rejects.toThrow("personalizada");
    expect(await rows()).toHaveLength(0);
    expect((await db.query("SELECT * FROM staff_request_quotas")).rows).toHaveLength(0);
  });
  it("allows replay after the limit while blocking a fresh batch", async () => {
    await enqueue();
    await db.exec("UPDATE staff_request_quotas SET request_count=30 WHERE window_seconds=600");
    expect((await enqueue()).replayed).toBe(true);
    await expect(enqueue(intent,"Oi",[ids.student],ids.student)).rejects.toMatchObject({ code: "PT429" });
    expect(await rows()).toHaveLength(1);
  });
  it("deduplicates active welcome and reengagement events across separate requests", async () => {
    const schedule = { kind: "at", scheduled_for: "2090-01-01T12:00:00Z", message_type: "welcome" };
    expect((await enqueue(schedule)).queued).toBe(1);
    expect((await enqueue(schedule,"Oi",[ids.student],ids.student)).queued).toBe(0);
    expect(await rows()).toHaveLength(1);
  });
});
