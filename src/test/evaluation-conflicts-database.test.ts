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
  await db.exec(readFileSync(resolve("supabase/migrations/20261015210000_student_admission.sql"), "utf8"));
  await db.query("INSERT INTO staff_members(user_id,role) VALUES ($1,'recepcao'),($2,'avaliador')", [ids.reception, ids.evaluator]);
  await db.query("INSERT INTO students(id,name,phone,status) VALUES ($1,'Aluno fictício','43999999999','active')", [ids.student]);
  await db.exec(readFileSync(resolve("supabase/migrations/20261014020000_atomic_message_enqueue.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261014030000_restrict_direct_queue_inserts.sql"), "utf8"));
  await db.exec(readFileSync(resolve("supabase/migrations/20261014040000_evaluation_conflict_lookup.sql"), "utf8"));
}, 60_000);

afterAll(async () => { await db?.close(); });


const otherStudent = "00000000-0000-4000-8000-000000000021";
const target = "2090-01-01T15:00:00Z";
beforeEach(async () => {
  await db.exec("TRUNCATE evaluations CASCADE");
  await db.query("INSERT INTO students(id,name,phone) VALUES ($1,'Outro aluno','00000000000') ON CONFLICT DO NOTHING",[otherStudent]);
});
async function appointment(student: string, when: string) {
  return (await db.query<{ id: string }>("INSERT INTO evaluations(student_id,scheduled_at,status) VALUES ($1,$2,'scheduled') RETURNING id",[student,when])).rows[0].id;
}
async function check(ignore?: string, student = ids.student, at = target, user: "admin" | "reception" | "evaluator" | "stranger" = "admin") {
  return (await asUser<{ result: { duplicate: {evaluation_id: string} | null; conflict: {evaluation_id: string; student_name: string} | null } }>(user,
    "SELECT evaluation_schedule_conflicts($1,$2,$3) AS result",[student,at,ignore ?? null])).rows[0].result;
}
describe("authoritative evaluation preflight", () => {
  it("preserves legacy admission data and records reported assessment without a fake appointment", async () => {
    const legacy = await db.query("SELECT enrollment_date,benefit,initial_evaluation_date FROM students WHERE id=$1", [ids.student]);
    expect(legacy.rows[0]).toEqual({ enrollment_date: null, benefit: null, initial_evaluation_date: null });
    const created = await asUser<{ id: string }>("admin", "INSERT INTO students(name,phone,enrollment_date,benefit,initial_evaluation_date,last_evaluation_date,had_evaluation) VALUES ('Admission QA','43999990000','2026-01-01','Desconto especial','2026-09-01','2026-09-01',true) RETURNING id");
    try {
      expect((await db.query("SELECT id FROM evaluations WHERE student_id=$1", [created.rows[0].id])).rows).toHaveLength(0);
      await db.query<{ id: string }>("INSERT INTO students(name,phone,enrollment_date,had_evaluation) VALUES ('Imported admission','43999990001',current_date-30,false) RETURNING id").then(async result => {
        const imported = result.rows[0].id;
        try {
          const dashboard = await asUser<{ snapshot: { actions: { id: string; type: string }[] } }>("admin", "SELECT get_workout_dashboard() AS snapshot");
          expect(dashboard.rows[0].snapshot.actions).toEqual(expect.arrayContaining([expect.objectContaining({ id: imported, type: "evaluation" })]));
        } finally { await db.query("DELETE FROM students WHERE id=$1", [imported]); }
      });
      await expect(asUser("admin", "UPDATE students SET enrollment_date='2099-01-01' WHERE id=$1", [created.rows[0].id])).rejects.toMatchObject({ code: "23514" });
      await expect(asUser("admin", "UPDATE students SET initial_evaluation_date='2026-01-01' WHERE id=$1", [created.rows[0].id])).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("UPDATE students SET initial_evaluation_date='infinity' WHERE id=$1", [created.rows[0].id])).rejects.toMatchObject({ code: "23514" });
    } finally { await db.query("DELETE FROM students WHERE id=$1", [created.rows[0].id]); }
  });
  it("returns explicit empty results", async () => {
    expect(await check()).toEqual({ duplicate: null, conflict: null });
  });
  it("returns the earliest duplicate for the student", async () => {
    await appointment(ids.student,"2090-01-03T15:00:00Z");
    const earliest = await appointment(ids.student,"2090-01-02T15:00:00Z");
    expect((await check()).duplicate?.evaluation_id).toBe(earliest);
  });
  it("excludes the appointment being rescheduled", async () => {
    const id = await appointment(ids.student,target);
    expect(await check(id)).toEqual({ duplicate: null, conflict: null });
  });
  it("rejects ignoring an appointment from another student", async () => {
    const id = await appointment(otherStudent,target);
    await expect(check(id)).rejects.toMatchObject({ code: "22023" });
  });
  it.each([-30,30])("excludes exactly %i minutes from the conflict window", async minutes => {
    await appointment(otherStudent,new Date(Date.parse(target)+minutes*60000).toISOString());
    expect((await check()).conflict).toBeNull();
  });
  it.each([-29,0,29])("includes %i minutes in the conflict window", async minutes => {
    const id = await appointment(otherStudent,new Date(Date.parse(target)+minutes*60000).toISOString());
    expect((await check()).conflict?.evaluation_id).toBe(id);
  });
  it("selects the nearest conflict deterministically", async () => {
    await appointment(otherStudent,"2090-01-01T15:20:00Z");
    const nearest = await appointment(otherStudent,"2090-01-01T14:55:00Z");
    expect((await check()).conflict?.evaluation_id).toBe(nearest);
  });
  it("finds conflicts beyond a thousand existing records", async () => {
    await db.query("INSERT INTO evaluations(student_id,scheduled_at,status) SELECT $1,'2080-01-01'::timestamptz+make_interval(mins=>i),'scheduled' FROM generate_series(1,1500) i",[otherStudent]);
    const id = await appointment(otherStudent,target);
    expect((await check()).conflict?.evaluation_id).toBe(id);
  });
  it("ignores cancelled appointments", async () => {
    const id = await appointment(otherStudent,target);
    await db.query("UPDATE evaluations SET status='cancelled' WHERE id=$1",[id]);
    expect((await check()).conflict).toBeNull();
  });
  it("is independent of session timezone", async () => {
    await appointment(otherStudent,target);
    const first = await check();
    await db.exec("SET timezone='Pacific/Honolulu'");
    try { expect(await check()).toEqual(first); }
    finally { await db.exec("SET timezone='UTC'"); }
  });
  it.each(["reception","evaluator"] as const)("permits %s",async user => {
    expect(await check(undefined,ids.student,target,user)).toEqual({ duplicate: null, conflict: null });
  });
  it("denies nonstaff and anonymous callers",async () => {
    await expect(check(undefined,ids.student,target,"stranger")).rejects.toMatchObject({ code: "42501" });
    await db.exec("SET ROLE anon");
    try { await expect(db.query("SELECT evaluation_schedule_conflicts($1,$2)",[ids.student,target])).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("RESET ROLE"); }
  });
  it("rejects past dates and nonexistent students",async () => {
    await expect(check(undefined,ids.student,"2020-01-01T12:00:00Z")).rejects.toMatchObject({ code: "22023" });
    await expect(check(undefined,ids.admin)).rejects.toMatchObject({ code: "22023" });
  });
  it("does not authorize a conflict introduced after preflight",async () => {
    expect((await check()).conflict).toBeNull();
    await appointment(otherStudent,target);
    await expect(asUser("admin","SELECT mutate_evaluation_tx('create',gen_random_uuid(),$1,$2)",[ids.student,target])).rejects.toThrow("Conflito");
  });
});
