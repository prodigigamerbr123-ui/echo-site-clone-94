import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: "staff", write: vi.fn(), read: vi.fn(), eq: vi.fn(), is: vi.fn(), update: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: mocks.user } } }, error: null }) },
  from: () => ({ update: mocks.update, select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }),
} }));
import { saveEvaluationNotes } from "@/lib/evaluationNotes";
beforeEach(() => {
  mocks.user = "staff";
  mocks.write.mockReset().mockResolvedValue({ data: { id: "evaluation", notes: "new" }, error: null });
  mocks.read.mockReset();
  const query = { eq: mocks.eq, is: mocks.is, select: () => ({ maybeSingle: mocks.write }) };
  mocks.eq.mockReset().mockReturnValue(query);
  mocks.is.mockReset().mockReturnValue(query);
  mocks.update.mockReset().mockReturnValue(query);
});
describe("evaluation note edits", () => {
  it("updates only the version opened in the editor and requires a returned authorized row", async () => {
    await saveEvaluationNotes("evaluation", "old", "new");
    expect(mocks.eq).toHaveBeenCalledWith("notes", "old");
    expect(mocks.eq).toHaveBeenCalledWith("id", "evaluation");
  });
  it("compares nullable notes explicitly and normalizes empty notes to null", async () => {
    mocks.write.mockResolvedValue({ data: { id: "evaluation", notes: null }, error: null });
    await saveEvaluationNotes("evaluation", null, "");
    expect(mocks.is).toHaveBeenCalledWith("notes", null);
    expect(mocks.update).toHaveBeenCalledWith({ notes: null });
  });
  it("refuses concurrent edits without silently overwriting them", async () => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    mocks.read.mockResolvedValue({ data: { id: "evaluation", notes: "another edit" }, error: null });
    await expect(saveEvaluationNotes("evaluation", "old", "new")).rejects.toThrow("foi alterada");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("recognizes a prior committed edit after loss of its response", async () => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    mocks.read.mockResolvedValue({ data: { id: "evaluation", notes: "new" }, error: null });
    await expect(saveEvaluationNotes("evaluation", "old", "new")).resolves.toBeUndefined();
  });
  it.each([null, { id: "another-evaluation", notes: "new" }])("never reports success for an inaccessible or different row %j", async data => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    mocks.read.mockResolvedValue({ data, error: null });
    await expect(saveEvaluationNotes("evaluation", "old", "new")).rejects.toThrow("não está mais acessível");
  });
  it("does not expose private database errors", async () => {
    mocks.write.mockResolvedValue({ data: null, error: { message: "private-schema-detail" } });
    await expect(saveEvaluationNotes("evaluation", "old", "new")).rejects.toThrow("Não foi possível salvar");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects invalid success responses", async () => {
    mocks.write.mockResolvedValue({ data: { id: "different", notes: "new" }, error: null });
    await expect(saveEvaluationNotes("evaluation", "old", "new")).rejects.toThrow("Resposta inválida");
  });
});
