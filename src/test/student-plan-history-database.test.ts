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
  ];
  for (const migration of migrations) {
    await db.exec(readFileSync(resolve("supabase/migrations", migration), "utf8").replace(/CREATE EXTENSION IF NOT EXISTS pg_(cron|net);/g, ""));
  }
  await db.query("INSERT INTO staff_members(user_id,role) VALUES ($1,'recepcao'),($2,'avaliador')", [ids.reception, ids.evaluator]);
}, 60_000);
beforeEach(async () => {
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SELECT set_config('request.jwt.claim.role','service_role',false); TRUNCATE students CASCADE;");
  await db.query("INSERT INTO students(id,name,phone,plan,payment_due_date) VALUES ($1,'Aluno fictício','43999990000','Mensal','2099-01-31')", [ids.student]);
});
afterAll(async () => { await db?.close(); });

describe("student plan history in PostgreSQL", () => {
  it("does not invent historical events from a student's initial plan", async () => {
    expect((await asUser("admin", "SELECT * FROM student_plan_history")).rows).toHaveLength(0);
  });
  it("records a renewal and a manual correction with their exact before/after values", async () => {
    await asUser("admin", "UPDATE students SET payment_due_date='2099-02-28' WHERE id=$1", [ids.student]);
    await asUser("reception", "UPDATE students SET plan='Trimestral',payment_due_date='2099-05-28' WHERE id=$1", [ids.student]);
    const { rows } = await asUser("admin", "SELECT previous_plan,plan,previous_due_date::text,payment_due_date::text,actor_id FROM student_plan_history ORDER BY created_at,id");
    expect(rows).toEqual([
      { previous_plan: "Mensal", plan: "Mensal", previous_due_date: "2099-01-31", payment_due_date: "2099-02-28", actor_id: ids.admin },
      { previous_plan: "Mensal", plan: "Trimestral", previous_due_date: "2099-02-28", payment_due_date: "2099-05-28", actor_id: ids.reception },
    ]);
  });
  it("ignores unchanged fields, unrelated edits and stale conditional writes", async () => {
    await asUser("admin", "UPDATE students SET plan=plan,payment_due_date=payment_due_date,name='Nome atualizado' WHERE id=$1", [ids.student]);
    const stale = await asUser("admin", "UPDATE students SET payment_due_date='2099-02-28' WHERE id=$1 AND payment_due_date='2098-01-31' RETURNING id", [ids.student]);
    expect(stale.rows).toHaveLength(0);
    expect((await asUser("admin", "SELECT * FROM student_plan_history")).rows).toHaveLength(0);
  });
  it("enforces read permissions and prevents manual rewriting or forged entries", async () => {
    await asUser("admin", "UPDATE students SET plan='Anual' WHERE id=$1", [ids.student]);
    expect((await asUser("reception", "SELECT id FROM student_plan_history")).rows).toHaveLength(1);
    expect((await asUser("evaluator", "SELECT id FROM student_plan_history")).rows).toHaveLength(0);
    expect((await asUser("stranger", "SELECT id FROM student_plan_history")).rows).toHaveLength(0);
    for (const sql of ["INSERT INTO student_plan_history(student_id) VALUES ($1)", "UPDATE student_plan_history SET plan='Falso' WHERE student_id=$1", "DELETE FROM student_plan_history WHERE student_id=$1"]) {
      await expect(asUser("admin", sql, [ids.student])).rejects.toMatchObject({ code: "42501" });
    }
    await db.exec("SET ROLE anon");
    try { await expect(db.query("SELECT * FROM student_plan_history")).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("RESET ROLE"); }
  });
  it("rolls back the due date and reminder cancellation if history persistence fails", async () => {
    await db.query("INSERT INTO scheduled_messages(student_id,content,scheduled_for,message_type,status) VALUES ($1,'Fixture',now()+interval '1 day','payment_reminder_due','pending')", [ids.student]);
    await db.exec(`CREATE FUNCTION public.reject_plan_history_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture failure'; END $$;
      CREATE TRIGGER reject_plan_history_fixture BEFORE INSERT ON public.student_plan_history FOR EACH ROW EXECUTE FUNCTION public.reject_plan_history_fixture();`);
    try {
      await expect(asUser("admin", "UPDATE students SET payment_due_date='2099-02-28' WHERE id=$1", [ids.student])).rejects.toThrow("Fixture failure");
      expect((await db.query("SELECT payment_due_date::text FROM students WHERE id=$1", [ids.student])).rows[0]).toEqual({ payment_due_date: "2099-01-31" });
      expect((await db.query("SELECT status FROM scheduled_messages WHERE student_id=$1", [ids.student])).rows[0]).toEqual({ status: "pending" });
      expect((await db.query("SELECT id FROM student_plan_history")).rows).toHaveLength(0);
    } finally { await db.exec("DROP TRIGGER reject_plan_history_fixture ON student_plan_history; DROP FUNCTION public.reject_plan_history_fixture()"); }
  });
  it("records technical changes without inventing a staff identity and preserves the existing deletion model", async () => {
    await db.query("UPDATE students SET payment_due_date=NULL WHERE id=$1", [ids.student]);
    expect((await db.query("SELECT actor_id,payment_due_date FROM student_plan_history")).rows[0]).toEqual({ actor_id: null, payment_due_date: null });
    await asUser("admin", "DELETE FROM students WHERE id=$1", [ids.student]);
    expect((await db.query("SELECT id FROM student_plan_history")).rows).toHaveLength(0);
  });
});
