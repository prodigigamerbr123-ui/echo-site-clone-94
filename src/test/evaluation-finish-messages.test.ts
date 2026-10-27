import { finishEvaluationWithMessages } from "@/lib/evaluationActions";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), settings: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("@/lib/evaluationIntent", () => ({ evaluationUserId: async () => "fixture", assertEvaluationIdentity: async () => {} }));
vi.mock("@/lib/automationSettings", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/automationSettings")>(), fetchAutomationSettings: mock.settings }));
vi.mock("@/lib/messageTemplates", () => ({ resolveAutomationMessage: async (_key: string, _type: string, content: string) => content }));
beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockResolvedValue({ data: { evaluation_id: "eval-1", messages_created: 0, in_flight: 0, already_applied: false }, error: null });
});
describe("optional automation when finishing an evaluation", () => {
  it("sends an explicitly reviewed visit date to the dedicated completion transaction", async () => {
    await finishEvaluationWithMessages("eval-1", "Ana", "completed", { sendAutomaticMessage: false, performedOn: "2026-10-01" });
    expect(mock.rpc).toHaveBeenCalledWith("complete_evaluation_on_tx", { _evaluation_id: "eval-1", _performed_on: "2026-10-01", _messages: [] });
    expect(mock.settings).not.toHaveBeenCalled();
  });
  it("rejects an invalid visit date before building messages or calling the server", async () => {
    await expect(finishEvaluationWithMessages("eval-1", "Ana", "completed", { sendAutomaticMessage: true, performedOn: "2026-02-30" })).rejects.toThrow("data de atendimento");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.settings).not.toHaveBeenCalled();
  });
  it("does not fetch settings or generate a message when the user opts out", async () => {
    mock.settings.mockRejectedValue(new Error("Unavailable"));
    await finishEvaluationWithMessages("eval-1", "Ana", "completed", { sendAutomaticMessage: false });
    expect(mock.settings).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith("mutate_evaluation_tx", expect.objectContaining({ _action: "completed", _messages: [] }));
  });
  it("keeps messages empty if the automation was disabled before saving", async () => {
    mock.settings.mockResolvedValue({ evaluation_followup: { key: "evaluation_followup", enabled: false, params: {} } });
    await finishEvaluationWithMessages("eval-1", "Ana", "completed", { sendAutomaticMessage: true });
    expect(mock.rpc).toHaveBeenCalledWith("mutate_evaluation_tx", expect.objectContaining({ _messages: [] }));
  });
  it("builds only the requested follow-up when the automation remains enabled", async () => {
    mock.settings.mockResolvedValue({ evaluation_followup: { key: "evaluation_followup", enabled: true, params: { days_after: 7 } } });
    await finishEvaluationWithMessages("eval-1", "Ana", "completed", { sendAutomaticMessage: true });
    expect(mock.rpc).toHaveBeenCalledWith("mutate_evaluation_tx", expect.objectContaining({ _messages: [expect.objectContaining({ message_type: "evaluation_followup", content: expect.stringContaining("Ana") })] }));
  });
});
