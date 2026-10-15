import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAutomationManager } from "@/hooks/useAutomationManager";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), callbacks: [] as Array<(() => void) | undefined> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, error: null }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: (options: { onSuccess?: () => void }) => { mocks.callbacks.push(options.onSuccess); return {}; },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

it("refreshes catalog and manual composer when an automation model is linked", () => {
  mocks.callbacks.length = 0;
  renderHook(useAutomationManager);
  act(() => mocks.callbacks[2]?.());
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["automation-settings"] });
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["predefined-messages"] });
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["message-composer-data"] });
});
