import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "./database.types.ts";
import { resolveAutomationMessage } from "./messageTemplates.ts";

const settings = { birthday: { params: { templates: { birthday: "fixture" } } } };
function client(load: () => { data: { content: string } | null; error: unknown }) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => load() }) }) }) } as unknown as SupabaseClient<Database>;
}
function expect(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}; got ${String(actual)}`);
}
const resolve = (db: SupabaseClient<Database>) => resolveAutomationMessage(db, settings, "birthday", "birthday", "Fallback", { nome: "Teste" });

Deno.test("request cache avoids repeated reads, a new request sees edits and deletion", async () => {
  let content: string | null = "Original {nome}", reads = 0;
  const load = () => { reads++; return { data: content === null ? null : { content }, error: null }; };
  const first = client(load);
  expect(await resolve(first), "Original Teste");
  expect(await resolve(first), "Original Teste");
  expect(reads, 1);
  content = "Editado {nome}";
  expect(await resolve(client(load)), "Editado Teste");
  content = null;
  expect(await resolve(client(load)), "Fallback");
});
Deno.test("RLS identities never share template content and failed reads are not cached", async () => {
  const privileged = client(() => ({ data: { content: "Privado" }, error: null }));
  expect(await resolve(privileged), "Privado");
  let failed = true;
  const restricted = client(() => ({ data: null, error: failed ? { message: "RLS" } : null }));
  let rejected = false;
  try { await resolve(restricted); } catch { rejected = true; }
  expect(rejected, true);
  failed = false;
  expect(await resolve(restricted), "Fallback");
});
