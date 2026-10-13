import { describe, expect, it, vi } from "vitest";
import { createTemplateReader, interpolate } from "../../supabase/functions/_shared/templateResolver";

const db = vi.hoisted(() => ({ content: "Original {nome}", error: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.content === null ? null : { content: db.content }, error: db.error }) }) }) }),
} }));
vi.mock("@/lib/automationSettings", () => ({ fetchAutomationSettings: vi.fn() }));
import { resolveAutomationMessage } from "@/lib/messageTemplates";

describe("modelos de mensagem atuais", () => {
  it("reutiliza leituras apenas dentro da mesma operação", async () => {
    let content = "Original";
    const load = vi.fn(async () => content);
    const operation = createTemplateReader(load);
    expect(await operation("id")).toBe("Original");
    content = "Editado";
    expect(await operation("id")).toBe("Original");
    expect(load).toHaveBeenCalledTimes(1);
    expect(await createTemplateReader(load)("id")).toBe("Editado");
    expect(await createTemplateReader(async () => null)("id")).toBeNull();
  });
  it("não guarda falhas como template ausente", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("Banco indisponível")).mockResolvedValueOnce("Recuperado");
    const read = createTemplateReader(load);
    await expect(read("id")).rejects.toThrow("Banco indisponível");
    expect(await read("id")).toBe("Recuperado");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("mantém placeholders iguais no frontend e backend", () => {
    expect(interpolate("{nome}/{NAME}/{aluno} {dias}/{days} {desconhecido}", {nome:"Teste",dias:"3"}))
      .toBe("Teste/Teste/Teste 3/3 {desconhecido}");
    expect(interpolate("{constructor}", {})).toBe("{constructor}");
  });
  it("o navegador lê edições e exclusões e propaga erros de consulta", async () => {
    const settings = {birthday:{key:"birthday",enabled:true,params:{templates:{birthday:"id"}}}};
    db.content = "Original {nome}"; db.error = null;
    expect(await resolveAutomationMessage("birthday","birthday","Fallback",{nome:"Teste"},settings)).toBe("Original Teste");
    db.content = "Editado {nome}";
    expect(await resolveAutomationMessage("birthday","birthday","Fallback",{nome:"Teste"},settings)).toBe("Editado Teste");
    db.error = { message: "Sem acesso" };
    await expect(resolveAutomationMessage("birthday","birthday","Fallback",{},settings)).rejects.toEqual(db.error);
    db.error = null; db.content = null;
    expect(await resolveAutomationMessage("birthday","birthday","Fallback",{},settings)).toBe("Fallback");
  });
});
