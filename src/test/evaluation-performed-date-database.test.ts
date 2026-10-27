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
    "20261026000000_dashboard_active_without_evaluation.sql",
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



async function dayAgo(days: number) {
  return (await db.query<{ day: string }>("SELECT ((clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date-$1::integer)::text AS day", [days])).rows[0].day;
}
async function appointment(future = false) {
  return (await db.query<{ id: string }>("INSERT INTO evaluations(student_id,scheduled_at,status) VALUES ($1,now()+make_interval(days=>$2),'scheduled') RETURNING id", [ids.student, future ? 1 : -1])).rows[0].id;
}
async function complete(id: string, date: string | null, messages: unknown[] = [], role: "admin" | "reception" | "evaluator" | "stranger" = "admin") {
  return (await asUser<{ result: { already_applied: boolean; messages_created: number } }>(role,
    "SELECT complete_evaluation_on_tx($1,$2::date,$3::jsonb) AS result", [id,date,JSON.stringify(messages)])).rows[0].result;
}

describe("actual evaluation date in PostgreSQL", () => {
  it("stores the actual visit separately from booking and recording time", async () => {
    const id = await appointment(), actual = await dayAgo(10);
    await complete(id, actual, [], "evaluator");
    const { rows } = await db.query("SELECT status,performed_on::text,completed_at IS NOT NULL AS recorded,scheduled_at < now() AS booking_preserved FROM evaluations WHERE id=$1", [id]);
    expect(rows[0]).toEqual({ status: "completed", performed_on: actual, recorded: true, booking_preserved: true });
    expect((await db.query("SELECT last_evaluation_date::text,had_evaluation FROM students")).rows[0]).toEqual({ last_evaluation_date: actual, had_evaluation: true });
  });
  it("does not replace a more recent student evaluation with an older visit", async () => {
    const recent = await dayAgo(2);
    await db.query("UPDATE students SET last_evaluation_date=$1::date,had_evaluation=true", [recent]);
    await complete(await appointment(), await dayAgo(10));
    expect((await db.query("SELECT last_evaluation_date::text FROM students")).rows[0]).toEqual({ last_evaluation_date: recent });
  });
  it("replays the same result without duplicating follow-ups and rejects silent date rewriting", async () => {
    const id = await appointment(), date = await dayAgo(2);
    const messages = [{ message_type: "evaluation_followup", content: "Fixture", scheduled_for: new Date(Date.now()+86400000).toISOString() }];
    expect(await complete(id,date,messages)).toMatchObject({ already_applied: false, messages_created: 1 });
    expect(await complete(id,date,messages)).toMatchObject({ already_applied: true, messages_created: 0 });
    await expect(complete(id,await dayAgo(3))).rejects.toThrow("já encerrada");
    expect((await db.query("SELECT id FROM scheduled_messages")).rows).toHaveLength(1);
  });
  it("rejects missing, future, infinite and before-birth dates without closing the appointment", async () => {
    const id = await appointment();
    for (const date of [null, await dayAgo(-1), "infinity", "-infinity"]) await expect(complete(id,date)).rejects.toThrow("data de atendimento");
    await db.query("UPDATE students SET birth_date=$1::date", [await dayAgo(100)]);
    await expect(complete(id,await dayAgo(101))).rejects.toThrow("nascimento");
    expect((await db.query("SELECT status,performed_on,completed_at FROM evaluations")).rows[0]).toEqual({ status: "scheduled", performed_on: null, completed_at: null });
  });
  it("rolls back visit date, completion, student summary and cancellation if follow-up validation fails", async () => {
    const id = await appointment();
    await db.query("INSERT INTO scheduled_messages(student_id,evaluation_id,content,scheduled_for,message_type) VALUES ($1,$2,'Fixture',now()+interval '1 day','evaluation_confirmation')", [ids.student,id]);
    await expect(complete(id,await dayAgo(3),[{ message_type: "evaluation_followup", content: "", scheduled_for: new Date(Date.now()+86400000).toISOString() }])).rejects.toThrow("Mensagem automática inválida");
    expect((await db.query("SELECT status,performed_on,completed_at FROM evaluations")).rows[0]).toEqual({ status: "scheduled", performed_on: null, completed_at: null });
    expect((await db.query("SELECT last_evaluation_date,had_evaluation FROM students")).rows[0]).toEqual({ last_evaluation_date: null, had_evaluation: false });
    expect((await db.query("SELECT status FROM scheduled_messages")).rows[0]).toEqual({ status: "pending" });
  });
  it("preserves staff boundaries and blocks direct REST rewriting of the visit date", async () => {
    const id = await appointment(), date = await dayAgo(1);
    await expect(complete(id,date,[],"stranger")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser("admin","UPDATE evaluations SET performed_on=$1::date WHERE id=$2",[date,id])).rejects.toMatchObject({ code: "42501" });
    await db.exec("SET ROLE anon");
    try { await expect(db.query("SELECT complete_evaluation_on_tx($1,$2::date)",[id,date])).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("RESET ROLE"); }
  });
  it("does not invent actual dates for old clients or amend legacy completed rows on retry", async () => {
    const id = await appointment();
    await asUser("admin","SELECT mutate_evaluation_tx('completed',$1)",[id]);
    expect((await db.query("SELECT performed_on FROM evaluations")).rows[0]).toEqual({ performed_on: null });
    await expect(complete(id,await dayAgo(1))).rejects.toThrow("sem data informada");
  });
  it("continues to honor refusal of messages and preserves the future-appointment rule", async () => {
    await db.query("UPDATE students SET messages_enabled=false");
    const result = await complete(await appointment(),await dayAgo(1),[{ message_type: "evaluation_followup", content: "Fixture", scheduled_for: new Date(Date.now()+86400000).toISOString() }]);
    expect(result.messages_created).toBe(0);
    const future = await appointment(true);
    await expect(complete(future,await dayAgo(0))).rejects.toThrow("dia futuro");
    expect((await db.query("SELECT performed_on FROM evaluations WHERE id=$1",[future])).rows[0]).toEqual({ performed_on: null });
  });
  it("counts new completions by actual visit month instead of the recording month", async () => {
    const lastMonth = (await db.query<{ day: string }>("SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date-1)::text AS day")).rows[0].day;
    await complete(await appointment(),lastMonth);
    const dashboard = (await asUser<{ result: { stats: { evaluationsCompletedMonth: number } } }>("admin","SELECT get_workout_dashboard() AS result")).rows[0].result;
    expect(dashboard.stats.evaluationsCompletedMonth).toBe(0);
  });
  it("counts never-evaluated students only among active students", async () => {
    await db.query("INSERT INTO students(name,phone,plan,status,had_evaluation) VALUES ('Inativo fictício','43999990001','Mensal','inactive',false),('Avaliado fictício','43999990002','Mensal','active',true)");
    const dashboard = (await asUser<{ result: { stats: { studentsWithoutEvaluation: number } } }>("admin","SELECT get_workout_dashboard() AS result")).rows[0].result;
    expect(dashboard.stats.studentsWithoutEvaluation).toBe(1);
  });
});
