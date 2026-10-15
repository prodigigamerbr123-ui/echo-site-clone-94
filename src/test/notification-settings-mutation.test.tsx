import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useUpdateNotificationSettings } from "@/lib/appSettings";
import type { PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }), upsert: mocks.write }),
} }));
afterEach(cleanup);

it("serializes read/merge/write patches across hook instances in the same client", async () => {
  let stored: Record<string, unknown> = { notify_failed: true, notify_sent_summary: true };
  let releaseFirst!: () => void;
  mocks.read.mockImplementation(async () => ({ data: { value: { ...stored } }, error: null }));
  mocks.write.mockImplementationOnce(({ value }: { value: Record<string, unknown> }) =>
    new Promise(resolve => { releaseFirst = () => { stored = value; resolve({ error: null }); }; }))
    .mockImplementation(async ({ value }: { value: Record<string, unknown> }) => {
      stored = value;
      return { error: null };
    });
  const client = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const first = renderHook(useUpdateNotificationSettings, { wrapper });
  const second = renderHook(useUpdateNotificationSettings, { wrapper });
  let one!: Promise<unknown>;
  let two!: Promise<unknown>;
  act(() => { one = first.result.current.mutateAsync({ notify_failed: false }); });
  await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
  act(() => { two = second.result.current.mutateAsync({ notify_sent_summary: false }); });
  await waitFor(() => expect(second.result.current.isPaused).toBe(true));
  expect(mocks.read).toHaveBeenCalledOnce();
  await act(async () => { releaseFirst(); await Promise.all([one, two]); });
  expect(stored.notify_failed).toBe(false);
  expect(stored.notify_sent_summary).toBe(false);
  expect(mocks.write).toHaveBeenCalledTimes(2);
  client.clear();
});
