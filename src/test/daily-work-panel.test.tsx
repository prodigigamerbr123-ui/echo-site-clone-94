import { DailyWorkPanel } from "@/components/dashboard/DailyWorkPanel";
import type { DashboardSnapshot, DashboardStats } from "../../supabase/functions/_shared/dashboardContracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  data: undefined as DashboardSnapshot | undefined, error: false, issueError: false,
  loading: false, role: "admin", issues: 3, refresh: vi.fn(), refreshIssues: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: mock.role }) }));
vi.mock("@/hooks/useDashboardData", () => ({
  useDailyWork: () => ({ data: mock.data, isLoading: mock.loading, isError: mock.error, isFetching: false, refetch: mock.refresh }),
  useDeliveryIssues: () => ({ data: mock.issueError ? undefined : mock.issues, isError: mock.issueError, isLoading: false, isFetching: false, refetch: mock.refreshIssues }),
}));
const keys = ["totalStudents", "activeStudents", "inactiveStudents", "newStudentsMonth", "evaluationsToday", "evaluationsWeek",
  "evaluationsMonth", "evaluationsOverdue", "evaluationsCompletedMonth", "studentsWithoutEvaluation", "birthdaysToday",
  "paymentOverdueCount", "paymentDueIn3DaysCount", "messagesToSendToday", "scheduledMessages", "messagesSentToday"];
beforeEach(() => {
  vi.clearAllMocks();
  mock.error = false; mock.issueError = false; mock.loading = false; mock.role = "admin";
  mock.data = { version: 1, generatedAt: "2026-10-18T13:00:00Z", day: "2026-10-18",
    stats: { ...Object.fromEntries(keys.map(key => [key, 0])), paymentOverdueCount: 7 } as DashboardStats,
    agenda: [], actions: [], birthdayNames: [] };
});
afterEach(cleanup);
const setup = () => render(<MemoryRouter><DailyWorkPanel /></MemoryRouter>);

describe("daily work panel", () => {
  it("links to active students with expired dates without asserting unpaid debt", () => {
    setup();
    expect(screen.getByRole("link", { name: /Prazos vencidos/ })).toHaveAttribute("href", "/alunos?status=active&vencimento=overdue");
    expect(screen.getByText(/Não comprova dívida/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Falhas de mensagem/ })).toHaveAttribute("href", "/caixa-de-saida?aba=falhas");
  });
  it("shows distinct contact reasons for the same person and opens the exact record", () => {
    mock.data!.actions = [
      { id: "student-1", name: "Ana", phone: "fixture", action: "Primeira avaliação", type: "evaluation" },
      { id: "student-1", name: "Ana", phone: "fixture", action: "Aniversário hoje", type: "birthday" },
    ];
    setup();
    expect(screen.getAllByText("Ana")).toHaveLength(2);
    expect(screen.getByText(/2 oportunidade/)).toHaveTextContent("um aluno pode aparecer por mais de um motivo");
    for (const link of screen.getAllByRole("link", { name: "Abrir ficha" })) {
      expect(link).toHaveAttribute("href", "/alunos?aluno=student-1");
    }
  });
  it("does not turn failure lookup errors into a zero count", () => {
    mock.issueError = true;
    setup();
    const row = screen.getByRole("link", { name: /Falhas de mensagem/ });
    expect(row).toHaveTextContent("Não foi possível conferir as falhas");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText(/Em dia:/)).not.toHaveTextContent("falhas de mensagem");
  });
  it("shows an explicit dashboard error without healthy empty-state claims", () => {
    mock.error = true;
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível conferir as pendências");
    expect(screen.queryByText(/Nenhum compromisso/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(mock.refreshIssues).toHaveBeenCalledOnce();
  });
  it("shows only evaluation work for an evaluator", () => {
    mock.role = "avaliador";
    setup();
    expect(screen.getByRole("heading", { name: "Agenda de hoje" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Falhas de mensagem/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Prazos vencidos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contatos a conferir" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar painel" }));
    expect(mock.refreshIssues).not.toHaveBeenCalled();
  });
  it("labels the agenda sample and formats its times in Brasilia", () => {
    mock.data!.stats.evaluationsToday = 25;
    mock.data!.agenda = [{ id: "eval-1", name: "Ana", scheduled_at: "2026-10-18T13:30:00Z" }];
    setup();
    expect(screen.getByText("10:30")).toBeInTheDocument();
    expect(screen.getByText(/Exibindo 1 de 25 compromissos/)).toBeInTheDocument();
  });
  it("puts only pending items first and lists settled ones as up to date", () => {
    mock.issues = 0;
    setup();
    expect(screen.getByRole("link", { name: /Prazos vencidos/ })).toHaveAttribute("href", "/alunos?status=active&vencimento=overdue");
    expect(screen.queryByRole("link", { name: /Falhas de mensagem/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Em dia:/)).toHaveTextContent("falhas de mensagem para revisar");
    mock.issues = 3;
  });
  it("reports a calm state only when every checked item is settled", () => {
    mock.issues = 0;
    mock.data!.stats.paymentOverdueCount = 0;
    setup();
    expect(screen.getByText("Nenhuma pendência nestes itens agora.")).toBeInTheDocument();
    mock.issues = 3;
  });
});
