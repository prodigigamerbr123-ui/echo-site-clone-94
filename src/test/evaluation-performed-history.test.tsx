import AvaliacaoFisica from "@/pages/AvaliacaoFisica";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/evaluationHistory", () => ({ fetchEvaluationHistory: async () => [
  { id: "one", student_id: "a", scheduled_at: "2026-10-15T15:00:00Z", status: "completed", notes: null, completed_at: "2026-10-18T15:00:00Z", performed_on: "2026-10-16", students: { name: "Ana", phone: "fixture" } },
  { id: "old", student_id: "b", scheduled_at: "2026-09-01T15:00:00Z", status: "completed", notes: null, completed_at: "2026-09-02T15:00:00Z", performed_on: null, students: { name: "Bruno", phone: "fixture" } },
] }));
afterEach(cleanup);

it("distinguishes appointment, actual visit and recording dates without inventing legacy dates", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><AvaliacaoFisica /></MemoryRouter></QueryClientProvider>);
  const row = (await screen.findByText("Ana")).closest("tr")!;
  expect(within(row).getByText("15/10/2026 12:00")).toBeVisible();
  expect(within(row).getByText("16/10/2026")).toBeVisible();
  expect(within(row).getByText("18/10/2026")).toBeVisible();
  const legacy = screen.getByText("Bruno").closest("tr")!;
  expect(within(legacy).getByText("Não informado (registro antigo)")).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Atendimento em" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Baixa registrada em" })).toBeVisible();
  client.clear();
});
