import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { students: [], messages: [
  { id: "old", student_id: "a", content: "Mensagem de ontem", status: "sent", sent_at: "2026-10-18T15:00:00Z" },
  { id: "new", student_id: "a", content: "Mensagem do novo dia", status: "sent", sent_at: "2026-10-19T03:00:00Z" },
] }, error: null, isPending: false }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("updates the active Today filter after midnight without refetching or reloading", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T02:59:50Z"));
  render(<MensagensEnviadasTab />);
  expect(screen.getByText("Mensagem de ontem")).toBeVisible();
  expect(screen.queryByText("Mensagem do novo dia")).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(30_000); });
  expect(screen.queryByText("Mensagem de ontem")).not.toBeInTheDocument();
  expect(screen.getByText("Mensagem do novo dia")).toBeVisible();
  expect(screen.getByText("19/10/2026 00:00 · Brasília")).toBeVisible();
});
