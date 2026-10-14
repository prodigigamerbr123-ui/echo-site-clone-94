/** Real HTTP handlers and Supabase client, with loopback-only upstream fixtures.
 * Run: deno test --allow-run --allow-env --allow-net=127.0.0.1:18081,127.0.0.1:8000 supabase/tests/staff-http.test.ts
 * No production environment files are loaded. SQL/RLS is covered separately.
 */
import { assertEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { requireCronSecret } from "../functions/_shared/auth.ts";

Deno.test("cron secrets are accepted only in headers", () => {
  const previous = Deno.env.get("CRON_SECRET");
  try {
    Deno.env.set("CRON_SECRET", "isolated-cron-test-secret");
    assertEquals(requireCronSecret(new Request("http://localhost/?cron_secret=isolated-cron-test-secret"))?.status, 401);
    assertEquals(requireCronSecret(new Request("http://localhost/", { headers: { "x-cron-secret": "wrong" } }))?.status, 401);
    assertEquals(requireCronSecret(new Request("http://localhost/"))?.status, 401);
    assertEquals(requireCronSecret(new Request("http://localhost/", { headers: { "x-cron-secret": "isolated-cron-test-secret" } })), null);
    Deno.env.delete("CRON_SECRET");
    assertEquals(requireCronSecret(new Request("http://localhost/"))?.status, 500);
  } finally {
    if (previous === undefined) Deno.env.delete("CRON_SECRET");
    else Deno.env.set("CRON_SECRET", previous);
  }
});

const studentId = "00000000-0000-4000-8000-000000000020";
const evaluationId = "00000000-0000-4000-8000-000000000030";
const roles = new Map<string, string | null>();
const tokens = new Map<string, string>();
const requests: { path: string; method: string; body: unknown; role: string | null }[] = [];
let roleServiceUnavailable = false;
let databaseUnavailable = false;
let providerUnavailable = false;
let quotaRetryAfter = 0;
let quotaUnavailable = false;
const env = {
  SUPABASE_URL: "http://127.0.0.1:18081",
  SUPABASE_ANON_KEY: "staging-public-placeholder",
  EVOLUTION_API_URL: "http://127.0.0.1:18081",
  EVOLUTION_INSTANCE_TOKEN: "staging-evolution-placeholder",
  CRON_SECRET: "isolated-cron-test-secret",
};
function base64url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function makeToken(id: string): Promise<string> {
  const part = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + base64url(JSON.stringify({ sub: id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now()/1000)+3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("isolated-test-signing-key-not-production"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return part + "." + base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(part))));
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
async function upstream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const user = tokens.get(token);
  const role = user ? roles.get(user) ?? null : null;
  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  requests.push({ path: url.pathname, method: req.method, body, role });
  if (url.pathname === "/auth/v1/user") {
    return user ? json({ id: user, aud: "authenticated", role: "authenticated", email: "fixture@test.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }) : json({ message: "Invalid token" }, 401);
  }
  if (url.pathname === "/rest/v1/rpc/current_staff_role") return roleServiceUnavailable ? json({ message: "Fixture unavailable" }, 500) : json(role);
  if (url.pathname === "/rest/v1/rpc/consume_staff_request_quota") return quotaUnavailable ? json({ message: "private-quota-marker" }, 500) : json(quotaRetryAfter);
  if (url.pathname === "/rest/v1/students") return json([{ id: studentId, name: "Aluno fictício" }]);
  if (url.pathname === "/rest/v1/scheduled_messages") return json(null, 201);
  if (url.pathname === "/rest/v1/rpc/complete_evaluation_tx") return databaseUnavailable
    ? json({ message: "private-db-detail-marker", details: "private-schema-marker" }, 500) : json(null);
  if (url.pathname === "/instance/status") return json({ data: { connected: true, loggedIn: true, state: "open" } });
  if (url.pathname === "/send/text") return providerUnavailable
    ? json({ error: "private-provider-detail-marker" }, 503)
    : json({ data: { Info: { ID: "fixture-message-id" }, token: "private-provider-detail-marker" } });
  if (url.pathname === "/instance/qr") return json({ data: { code: null } });
  return json({ error: "Unimplemented fixture route" }, 404);
}
async function launch(name: string) {
  const runtimeEnv: Record<string, string> = {};
  for (const key of ["SYSTEMROOT", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "DENO_DIR"]) {
    const value = Deno.env.get(key);
    if (value) runtimeEnv[key] = value;
  }
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--cached-only", "--import-map=supabase/tests/http-import-map.json", "--allow-read=supabase/functions,supabase/tests", "--allow-env", "--allow-net=127.0.0.1:8000,127.0.0.1:18081", "supabase/tests/http-runner.ts", name],
    clearEnv: true, env: { ...runtimeEnv, ...env, DENO_TLS_CA_STORE: "system" }, stdout: "null", stderr: "piped",
  }).spawn();
  const errors = new Response(child.stderr).text();
  let exited = false;
  void child.status.then(() => { exited = true; });
  let ready = false;
  for (let i=0; i<20; i++) {
    if (exited) break;
    try { const r = await fetch("http://127.0.0.1:8000", { method: "OPTIONS", signal: AbortSignal.timeout(500) }); await r.arrayBuffer(); if (r.ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!ready) {
    try { child.kill("SIGTERM"); } catch { /* exited */ }
    await child.status;
    throw new Error(`Handler ${name} failed to start: ${await errors}`);
  }
  return async () => { try { child.kill("SIGTERM"); } catch { /* exited */ } await child.status; await errors; };
}
async function call(user: string | null, body: unknown = {}) {
  const token = user ? [...tokens].find(([, id]) => id === user)?.[0] : null;
  const res = await fetch("http://127.0.0.1:8000", { method: "POST", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const data = await res.json();
  return { status: res.status, data };
}

Deno.test("staff HTTP authorization and compatibility endpoints", async (t) => {
  for (const [user, role] of [["00000000-0000-4000-8000-000000000010", "admin"], ["00000000-0000-4000-8000-000000000011", "recepcao"], ["00000000-0000-4000-8000-000000000012", "avaliador"], ["00000000-0000-4000-8000-000000000013", null]] as const) {
    roles.set(user, role); tokens.set(await makeToken(user), user);
  }
  const [admin, reception, evaluator, stranger] = [...roles.keys()];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 18081, onListen: () => {} }, upstream);
  try {
    for (const name of ["send-whatsapp", "ai-database-actions", "daily-briefing", "ai-assistant", "whatsapp-status", "whatsapp-diagnostic", "whatsapp-contacts"]) {
      const passed = await t.step(`${name}: rejects missing login and unassigned login`, async () => {
        const stop = await launch(name);
        try {
          assertEquals((await call(null)).status, 401);
          const invalid = await fetch("http://127.0.0.1:8000", { method: "POST", headers: { Authorization: "Bearer invalid-token", "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(5000) });
          assertEquals(invalid.status, 401); await invalid.arrayBuffer();
          assertEquals((await call(stranger)).status, 403);
          if (name !== "whatsapp-status") assertEquals((await call(evaluator)).status, 403);
        } finally { await stop(); }
      });
      if (!passed) return;
    }
    await t.step("send-whatsapp: enqueues only registered IDs and denies revoked staff", async () => {
      const stop = await launch("send-whatsapp");
      try {
        const before = requests.length;
        const result = await call(reception, { message: "Olá {nome}", students: [{ id: studentId, name: "Forged", phone: "00000000000" }] });
        assertEquals(result.status, 200); assertEquals(result.data.summary.queued, 1);
        const insert = requests.slice(before).find(r => r.path === "/rest/v1/scheduled_messages");
        assert(insert); const rows = insert.body as Record<string, unknown>[];
        assertEquals(rows[0].student_id, studentId); assertEquals(rows[0].content, "Olá Aluno fictício");
        assertEquals(rows[0].status, "pending"); assert(!("phone" in rows[0]));
        assertEquals((await call(reception, { message: "Test", students: [{ id: "invalid" }] })).status, 400);
        assertEquals((await call(reception, null)).status, 400);
        assertEquals((await call(reception, [])).status, 400);
        assertEquals((await call(reception, { message: "x".repeat(70000) })).status, 413);
        const beforeLimit = requests.length;
        quotaRetryAfter = 600;
        try {
          const blocked = await call(reception, { message: "Teste", students: [{ id: studentId }] });
          assertEquals(blocked.status, 429);
          assertEquals(blocked.data.retryAfter, 600);
          assert(!requests.slice(beforeLimit).some((request) => request.path === "/rest/v1/students" || request.path === "/rest/v1/scheduled_messages"));
        } finally { quotaRetryAfter = 0; }
        quotaUnavailable = true;
        try {
          const unavailable = await call(reception, { message: "Teste", students: [{ id: studentId }] });
          assertEquals(unavailable.status, 503);
          assert(!JSON.stringify(unavailable.data).includes("private-quota-marker"));
        } finally { quotaUnavailable = false; }
        roles.set(reception, null);
        assertEquals((await call(reception, { message: "Test", students: [{ id: studentId }] })).status, 403);
        roles.set(reception, "recepcao");
        roleServiceUnavailable = true;
        try { assertEquals((await call(reception, { message: "Test", students: [{ id: studentId }] })).status, 503); }
        finally { roleServiceUnavailable = false; }
      } finally { await stop(); }
    });
    await t.step("oneshot: limits input, requires cron authentication and redacts provider data", async () => {
      const stop = await launch("send-oneshot");
      const callInternal = async (body: unknown, secret = "isolated-cron-test-secret", method = "POST") => {
        const response = await fetch("http://127.0.0.1:8000", {
          method, headers: { "content-type": "application/json", "x-cron-secret": secret },
          ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, data: await response.json() };
      };
      try {
        const before = requests.filter((request) => request.path === "/send/text").length;
        assertEquals((await callInternal({ phone: "43999999999", text: "Teste" }, "wrong")).status, 401);
        assertEquals((await callInternal(null)).status, 400);
        assertEquals((await callInternal({ phone: {}, text: "Teste" })).status, 400);
        assertEquals((await callInternal({ phone: "43999999999", text: " " })).status, 400);
        assertEquals((await callInternal({ phone: "43999999999", text: "x".repeat(1001) })).status, 400);
        assertEquals((await callInternal({ phone: "43999999999", text: "x".repeat(9000) })).status, 413);
        assertEquals((await callInternal({}, "isolated-cron-test-secret", "GET")).status, 405);
        assertEquals(requests.filter((request) => request.path === "/send/text").length, before);
        const success = await callInternal({ phone: "43999999999", text: "Teste local" });
        assertEquals(success.status, 200);
        assertEquals(success.data.messageId, "fixture-message-id");
        assert(!("bodyText" in success.data));
        assert(!JSON.stringify(success.data).includes("private-provider-detail-marker"));
        providerUnavailable = true;
        const failure = await callInternal({ phone: "43999999999", text: "Teste local" });
        assertEquals(failure.status, 502);
        assertEquals(failure.data.uncertain, true);
        assert(!JSON.stringify(failure.data).includes("private-provider-detail-marker"));
      } finally { providerUnavailable = false; await stop(); }
    });
    for (const name of ["ai-assistant", "daily-briefing", "ai-database-actions"]) {
      await t.step(name + ": denies exhausted quota before data or provider access", async () => {
        const stop = await launch(name);
        const before = requests.length;
        quotaRetryAfter = 600;
        try {
          const limited = await call(admin, { messages: [{ role: "user", content: "Teste" }],
            action: "create_student", params: { name: "Fixture" }, userConfirmation: true });
          assertEquals(limited.status, 429);
          assertEquals(limited.data.retryAfter, 600);
          assert(!requests.slice(before).some((request) => !request.path.startsWith("/auth/") &&
            !["/rest/v1/rpc/current_staff_role", "/rest/v1/rpc/consume_staff_request_quota"].includes(request.path)));
        } finally { quotaRetryAfter = 0; await stop(); }
      });
    }
    await t.step("legacy AI completion: rejects arbitrary dates and invokes atomic RPC", async () => {
      const stop = await launch("ai-database-actions");
      try {
        const beforeRejected = requests.length;
        assertEquals((await call(admin, { action: "create_student", userConfirmation: "false", params: { name: "Rejected" } })).status, 403);
        assert(!requests.slice(beforeRejected).some(r => r.path === "/rest/v1/students"));
        assertEquals((await call(admin, null)).status, 400);
        assertEquals((await call(admin, { action: "create_student", userConfirmation: true, params: [] })).status, 400);
        assertEquals((await call(admin, { action: "update_student_evaluation", userConfirmation: true, params: { student_id: studentId, evaluation_date: "2026-01-01" } })).status, 400);
        const before = requests.length;
        const result = await call(admin, { action: "update_student_evaluation", userConfirmation: true, params: { evaluation_id: evaluationId } });
        assertEquals(result.status, 200);
        assertEquals(requests.slice(before).find(r => r.path === "/rest/v1/rpc/complete_evaluation_tx")?.body, { _evaluation_id: evaluationId });
        assert(!requests.slice(before).some(r => r.path === "/rest/v1/students"));
        databaseUnavailable = true;
        try {
          const failure = await call(admin, { action: "update_student_evaluation", userConfirmation: true, params: { evaluation_id: evaluationId } });
          assertEquals(failure.status, 500);
          assertEquals(failure.data, { error: "Erro interno do servidor" });
        } finally { databaseUnavailable = false; }
      } finally { await stop(); }
    });
    await t.step("WhatsApp: staff can read status, only admin can consult QR or disconnect", async () => {
      const stop = await launch("whatsapp-status");
      try {
        assertEquals((await call(evaluator, { action: "status" })).status, 200);
        assertEquals((await call(reception, { action: "qr" })).status, 403);
        const before = requests.length;
        assertEquals((await call(evaluator, { action: "logout" })).status, 403);
        assert(!requests.slice(before).some(r => r.path === "/instance/logout"));
        assertEquals((await call(admin, { action: "qr" })).status, 200);
      } finally { await stop(); }
    });
  } finally { await server.shutdown(); }
});
