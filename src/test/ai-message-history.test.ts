import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getAssistantMessageHistory } from "../../supabase/functions/_shared/aiMessageHistory";
import type { Database } from "../../supabase/functions/_shared/database.types";

function fixture(body: unknown, count: string | null = "0-0/45", status = 200) {
  const requests: URL[] = [];
  const client = createClient<Database>("http://127.0.0.1:9999", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push(new URL(String(input)));
      expect(new Headers(init?.headers).get("Prefer")).toContain("count=exact");
      return new Response(JSON.stringify(body), { status, headers: {
        "Content-Type": "application/json", ...(count ? { "Content-Range": count } : {}),
      } });
    } },
  });
  return { client, requests };
}

describe("histórico consultado pela IA", () => {
  it("envia filtro de aluno ao banco com join interno antes de limitar e informa total", async () => {
    const message = { id: "fixture", students: { name: "Ana", phone: "fixture" }, status: "sent" };
    const { client, requests } = fixture([message]);
    const result = await getAssistantMessageHistory(client, { student_name: "Ana", limit: 1 });
    expect(requests[0].searchParams.get("select")).toContain("students!inner");
    expect(requests[0].searchParams.get("students.name")).toBe("ilike.%Ana%");
    expect(requests[0].searchParams.get("limit")).toBe("1");
    expect(requests[0].searchParams.get("order")).toBe("sent_at.desc,id.desc");
    expect(result).toMatchObject({ count: 1, totalCount: 45, truncated: true, messages: [message] });
  });

  it("preserva mensagens sem aluno vinculado na consulta geral e sinaliza total indisponível", async () => {
    const { client, requests } = fixture([{ id: "deleted-student", students: null }], null);
    const result = await getAssistantMessageHistory(client, {});
    expect(requests[0].searchParams.get("select")).not.toContain("!inner");
    expect(requests[0].searchParams.has("students.name")).toBe(false);
    expect(result).toMatchObject({ count: 1, totalCount: null, truncated: null, limit: 30 });
  });

  it("escapa curingas no nome e distingue lista completa vazia de falha", async () => {
    const { client, requests } = fixture([], "*/0");
    expect(await getAssistantMessageHistory(client, { student_name: "A_%" })).toMatchObject({
      count: 0, totalCount: 0, truncated: false,
    });
    expect(requests[0].searchParams.get("students.name")).toBe("ilike.%A\\_\\%%");
    const failing = fixture({ message: "fixture denied", code: "42501" }, null, 403);
    await expect(getAssistantMessageHistory(failing.client, {})).rejects.toMatchObject({ code: "42501" });
  });
});
