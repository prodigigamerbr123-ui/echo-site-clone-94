// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  await db.query("INSERT INTO staff_members(user_id,role) VALUES ($1,'recepcao'),($2,'avaliador')", [ids.reception, ids.evaluator]);
  await db.query("INSERT INTO students(id,name,phone,status) VALUES ($1,'Aluno fictício','43999999999','active')", [ids.student]);
}, 60_000);

afterAll(async () => { await db?.close(); });

describe("permissões dos profissionais e dados do Workout", () => {
  it("permite somente uma automação em andamento, mesmo que antiga", async () => {
    const first = await db.query<{ id: string }>("INSERT INTO automation_runs(started_at) VALUES (now()-interval '2 days') RETURNING id");
    try {
      await expect(db.query("INSERT INTO automation_runs DEFAULT VALUES")).rejects.toMatchObject({ code: "23505" });
      await db.query("UPDATE automation_runs SET status='failed', finished_at=now() WHERE id=$1", [first.rows[0].id]);
      const second = await db.query<{ id: string }>("INSERT INTO automation_runs DEFAULT VALUES RETURNING id");
      await db.query("UPDATE automation_runs SET status='success', finished_at=now() WHERE id=$1", [second.rows[0].id]);
    } finally {
      await db.exec("DELETE FROM automation_runs");
    }
  });
  it("restringe o histórico ao administrador e gravações ao servidor", async () => {
    await db.exec("INSERT INTO automation_runs(status,finished_at) VALUES ('success',now())");
    try {
      expect((await asUser('admin', 'SELECT * FROM automation_runs')).rows).toHaveLength(1);
      expect((await asUser('stranger', 'SELECT * FROM automation_runs')).rows).toHaveLength(0);
      await expect(asUser('admin', 'INSERT INTO automation_runs DEFAULT VALUES')).rejects.toThrow();
      await expect(asUser('admin', "UPDATE automation_runs SET status='failed'")).rejects.toThrow();
      await db.exec('SET ROLE service_role');
      expect((await db.query('SELECT * FROM automation_runs')).rows).toHaveLength(1);
      await db.exec("INSERT INTO automation_runs DEFAULT VALUES");
    } finally {
      await db.exec('RESET ROLE; DELETE FROM automation_runs');
    }
  });
  it("consome a confirmação de IA uma vez e conserva o resultado", async () => {
    const row = await db.query<{id:string}>("INSERT INTO ai_pending_actions(owner_id,tool,args) VALUES ($1,'schedule_message','{}') RETURNING id",[ids.admin]);
    await db.exec('SET ROLE service_role');
    try {
      const claimed = await db.query<{result:{state:string}}>('SELECT claim_ai_action_tx($1,$2) AS result',[row.rows[0].id,ids.admin]);
      expect(claimed.rows[0].result.state).toBe('claimed');
      const repeated = await db.query<{result:{state:string}}>('SELECT claim_ai_action_tx($1,$2) AS result',[row.rows[0].id,ids.admin]);
      expect(repeated.rows[0].result.state).toBe('executing');
      await db.query("SELECT finish_ai_action_tx($1,$2,'{\"success\":true}',false)",[row.rows[0].id,ids.admin]);
      const completed = await db.query<{result:{state:string;result:{success:boolean}}}>('SELECT claim_ai_action_tx($1,$2) AS result',[row.rows[0].id,ids.admin]);
      expect(completed.rows[0].result).toMatchObject({state:'completed',result:{success:true}});
    } finally { await db.exec('RESET ROLE'); }
  });
  it("bloqueia confirmações de outro autor, expiradas e acesso direto", async () => {
    const row = await db.query<{id:string}>("INSERT INTO ai_pending_actions(owner_id,tool,args,expires_at) VALUES ($1,'schedule_message','{}',now()-interval '1 minute') RETURNING id",[ids.admin]);
    await expect(asUser('admin','SELECT claim_ai_action_tx($1,$2)',[row.rows[0].id,ids.admin])).rejects.toThrow();
    await expect(asUser('admin','SELECT * FROM ai_pending_actions')).rejects.toThrow();
    await db.exec('SET ROLE service_role');
    try {
      await expect(db.query('SELECT claim_ai_action_tx($1,$2)',[row.rows[0].id,ids.reception])).rejects.toThrow('não encontrada');
      await expect(db.query('SELECT claim_ai_action_tx($1,$2)',[row.rows[0].id,ids.admin])).rejects.toThrow('expirada');
    } finally { await db.exec('RESET ROLE'); }
  });
  it("permite somente a profissionais ativos reconhecerem sua função", async () => {
    for (const [user, expected] of [
      ["admin", "admin"], ["reception", "recepcao"],
      ["evaluator", "avaliador"], ["stranger", null],
    ] as const) {
      const res = await asUser(user, "SELECT current_staff_role() AS role");
      expect(res.rows[0].role).toBe(expected);
    }
  });

  it("oculta todos os alunos de um login sem vínculo e bloqueia escrita", async () => {
    const rows = await asUser("stranger", "SELECT id FROM students");
    expect(rows.rows).toHaveLength(0);
    await expect(asUser("stranger", "INSERT INTO students(name,phone) VALUES ('Novo','43990000000')"))
      .rejects.toThrow();
  });

  it("permite cadastro na recepção e proíbe cadastro e edição administrativa ao avaliador", async () => {
    await asUser("reception", "INSERT INTO students(name,phone) VALUES ('Segundo aluno','43991111111')");
    await expect(asUser("evaluator", "INSERT INTO students(name,phone) VALUES ('Terceiro','43992222222')"))
      .rejects.toThrow();
    const evaluatorEdit = await asUser("evaluator", "UPDATE students SET status='inactive' WHERE id=$1 RETURNING id", [ids.student]);
    expect(evaluatorEdit.rows).toHaveLength(0);
    await expect(asUser("evaluator", "UPDATE students SET had_evaluation=true WHERE id=$1", [ids.student]))
      .rejects.toThrow();
    await expect(asUser("admin", "UPDATE students SET last_evaluation_date=current_date WHERE id=$1", [ids.student]))
      .rejects.toThrow();
    await asUser("reception", "UPDATE students SET name='Aluno ajustado' WHERE id=$1", [ids.student]);
    const result = await db.query<{ had_evaluation: boolean }>("SELECT had_evaluation FROM students WHERE id=$1", [ids.student]);
    expect(result.rows[0].had_evaluation).toBe(false);
  });

  it("bloqueia alterações diretas na agenda, mas preserva a edição das observações", async () => {
    const ev = await db.query<{ id: string }>(
      "INSERT INTO evaluations(student_id,scheduled_at,status) VALUES ($1,now()+interval '11 days','scheduled') RETURNING id",
      [ids.student],
    );
    const id = ev.rows[0].id;
    await expect(asUser("admin", "INSERT INTO evaluations(student_id,scheduled_at) VALUES ($1,now()+interval '12 days')", [ids.student]))
      .rejects.toThrow();
    await expect(asUser("reception", "UPDATE evaluations SET scheduled_at=now()+interval '20 days' WHERE id=$1", [id]))
      .rejects.toThrow();
    await expect(asUser("evaluator", "UPDATE evaluations SET status='completed',completed_at=now() WHERE id=$1", [id]))
      .rejects.toThrow();
    await expect(asUser("admin", "DELETE FROM evaluations WHERE id=$1", [id]))
      .rejects.toThrow();
    const strangerUpdate = await asUser("stranger", "UPDATE evaluations SET notes='Invasão' WHERE id=$1 RETURNING id", [id]);
    expect(strangerUpdate.rows).toHaveLength(0);
    const notes = await asUser<{ notes: string }>(
      "evaluator", "UPDATE evaluations SET notes='Anamnese revisada' WHERE id=$1 RETURNING notes", [id],
    );
    expect(notes.rows[0].notes).toBe("Anamnese revisada");
    const unchanged = await db.query<{ status: string }>("SELECT status FROM evaluations WHERE id=$1", [id]);
    expect(unchanged.rows[0].status).toBe("scheduled");
  });

  it("exige vínculo ativo na RPC e executa criação e cancelamento transacionais", async () => {
    const student = await db.query<{ id: string }>(
      "INSERT INTO students(name,phone) VALUES ('Aluno da RPC','43990000321') RETURNING id",
    );
    const evaluationId = "00000000-0000-4000-8000-000000000030";
    const createSql = `SELECT mutate_evaluation_tx(
      'create',$1::uuid,$2::uuid,now()+interval '8 days','Agendamento', '[]'::jsonb,false
    ) AS result`;
    await expect(asUser("stranger", createSql, [evaluationId, student.rows[0].id]))
      .rejects.toThrow("sem permissão");
    await expect(asUser("stranger", `SELECT mutate_evaluation_internal_tx(
      'create',$1::uuid,$2::uuid,now()+interval '8 days','Invasão','[]'::jsonb,false
    )`, [evaluationId, student.rows[0].id])).rejects.toThrow();
    const created = await asUser<{ result: { evaluation_id: string } }>(
      "evaluator", createSql, [evaluationId, student.rows[0].id],
    );
    expect(created.rows[0].result.evaluation_id).toBe(evaluationId);
    await asUser("reception", "SELECT mutate_evaluation_tx('cancel',$1::uuid)", [evaluationId]);
    const cancelled = await db.query<{ status: string }>("SELECT status FROM evaluations WHERE id=$1", [evaluationId]);
    expect(cancelled.rows[0].status).toBe("cancelled");
  });

  it("atualiza o resumo do aluno apenas ao concluir a avaliação pela RPC", async () => {
    const student = await db.query<{ id: string }>(
      "INSERT INTO students(name,phone) VALUES ('Aluno conclusão','43990000654') RETURNING id",
    );
    const ev = await db.query<{ id: string }>(
      "INSERT INTO evaluations(student_id,scheduled_at,status) VALUES ($1,now()-interval '1 day','scheduled') RETURNING id",
      [student.rows[0].id],
    );
    await asUser("evaluator", "SELECT complete_evaluation_tx($1::uuid)", [ev.rows[0].id]);
    const evaluated = await db.query<{ status: string; had_evaluation: boolean; last_evaluation_date: string }>(`
      SELECT e.status, s.had_evaluation, s.last_evaluation_date
      FROM evaluations e JOIN students s ON s.id=e.student_id WHERE e.id=$1
    `, [ev.rows[0].id]);
    expect(evaluated.rows[0].status).toBe("completed");
    expect(evaluated.rows[0].had_evaluation).toBe(true);
    expect(evaluated.rows[0].last_evaluation_date).toBeTruthy();
  });

  it("não permite falsificar envios feitos ou o início de entrega", async () => {
    await expect(asUser("reception", "INSERT INTO scheduled_messages(student_id,content,scheduled_for,status) VALUES ($1,'Forjado',now()+interval '1 hour','sent')", [ids.student]))
      .rejects.toThrow("Estado inicial");
    const pending = await asUser<{ id: string }>("reception", "INSERT INTO scheduled_messages(student_id,content,scheduled_for) VALUES ($1,'Pendente',now()+interval '1 hour') RETURNING id", [ids.student]);
    const id = pending.rows[0].id;
    await expect(asUser("reception", "UPDATE scheduled_messages SET status='sent' WHERE id=$1", [id]))
      .rejects.toThrow("fila de envio");
    await expect(asUser("reception", "UPDATE scheduled_messages SET dispatch_started_at=now() WHERE id=$1", [id]))
      .rejects.toThrow("fila de envio");
  });

  it("protege o vínculo e a validade de mensagens automáticas sem bloquear reagendamento", async () => {
    const ev = await db.query<{ id: string }>(
      "INSERT INTO evaluations(student_id,scheduled_at,status) VALUES ($1,now()+interval '3 days','scheduled') RETURNING id",
      [ids.student],
    );
    const msg = await asUser<{ id: string }>("evaluator", `
      INSERT INTO scheduled_messages(student_id,evaluation_id,content,scheduled_for,message_type)
      VALUES ($1,$2,'Confirmação',now()+interval '1 day','evaluation_confirmation') RETURNING id
    `, [ids.student, ev.rows[0].id]);
    const messageId = msg.rows[0].id;
    const otherStudent = await db.query<{ id: string }>(
      "INSERT INTO students(name,phone) VALUES ('Outro aluno','43990000001') RETURNING id",
    );

    await expect(asUser("evaluator", "UPDATE scheduled_messages SET evaluation_id=NULL WHERE id=$1", [messageId]))
      .rejects.toThrow("Origem ou validade");
    await expect(asUser("evaluator", "UPDATE scheduled_messages SET student_id=$2 WHERE id=$1", [messageId, otherStudent.rows[0].id]))
      .rejects.toThrow("Origem ou validade");
    await expect(asUser("evaluator", "UPDATE scheduled_messages SET expires_at=now()+interval '30 days' WHERE id=$1", [messageId]))
      .rejects.toThrow("Origem ou validade");
    await expect(asUser("evaluator", "UPDATE scheduled_messages SET message_type='evaluation_followup' WHERE id=$1", [messageId]))
      .rejects.toThrow("Origem ou validade");

    const edited = await asUser<{ content: string }>("evaluator", `
      UPDATE scheduled_messages SET content='Confirmação corrigida', scheduled_for=now()+interval '2 days'
      WHERE id=$1 RETURNING content
    `, [messageId]);
    expect(edited.rows[0].content).toBe("Confirmação corrigida");
  });

  it("permite cancelamento seguro e evita que avaliador cancele mensagem manual", async () => {
    const msg = await asUser<{ id: string }>("reception", `
      INSERT INTO scheduled_messages(student_id,content,scheduled_for)
      VALUES ($1,'Lembrete manual',now()+interval '1 day') RETURNING id
    `, [ids.student]);
    const messageId = msg.rows[0].id;

    const unauthorized = await asUser<{ result: { cancelled: number } }>("evaluator", `
      SELECT cancel_scheduled_messages_tx(ARRAY[$1]::uuid[]) AS result
    `, [messageId]);
    expect(unauthorized.rows[0].result.cancelled).toBe(0);

    await db.query("UPDATE scheduled_messages SET status='failed' WHERE id=$1", [messageId]);
    const result = await asUser<{ result: { cancelled: number } }>("reception", `
      SELECT cancel_scheduled_messages_tx(ARRAY[$1]::uuid[]) AS result
    `, [messageId]);
    expect(result.rows[0].result.cancelled).toBe(1);
    const status = await db.query<{ status: string }>("SELECT status FROM scheduled_messages WHERE id=$1", [messageId]);
    expect(status.rows[0].status).toBe("cancelled");
    await expect(asUser("reception", "UPDATE scheduled_messages SET status='pending' WHERE id=$1", [messageId]))
      .rejects.toThrow("fila de envio");
  });

  it("protege conversas e mensagens de IA por proprietário", async () => {
    const mine = await asUser<{ id: string }>("reception", "INSERT INTO ai_conversations(title) VALUES ('Minha conversa') RETURNING id");
    const conversation = mine.rows[0].id;
    await asUser("reception", "INSERT INTO ai_messages(conversation_id,content,role) VALUES ($1,'Privado','user')", [conversation]);
    const other = await asUser("admin", "SELECT id FROM ai_conversations WHERE id=$1", [conversation]);
    expect(other.rows).toHaveLength(0);
    const hidden = await asUser("admin", "SELECT id FROM ai_messages WHERE conversation_id=$1", [conversation]);
    expect(hidden.rows).toHaveLength(0);
    await expect(asUser("evaluator", "INSERT INTO ai_conversations(title) VALUES ('Sem permissão')"))
      .rejects.toThrow();
    const old = await db.query<{ owner_id: string }>("SELECT owner_id FROM ai_conversations WHERE title='Conversa anterior'");
    expect(old.rows[0].owner_id).toBe(ids.admin);
  });

  it("impede que o último administrador desative a própria conta", async () => {
    await expect(asUser("admin", "UPDATE staff_members SET active=false WHERE user_id=$1", [ids.admin]))
      .rejects.toThrow("último administrador");
  });
});
