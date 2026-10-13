import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { useDashboardStats, useTodayActions } from "@/hooks/useDashboardData";

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: {id:"fixture"}, role:"admin",loading:false,roleLoading:false }) }));
afterEach(() => { cleanup(); mock.rpc.mockReset(); });
function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
function BothQueries() {
  const stats = useDashboardStats();
  const actions = useTodayActions();
  return <p>{stats.data?.totalStudents}:{actions.data?.length}</p>;
}
describe("consultas do dashboard", () => {
  it("compartilha uma consulta entre estatísticas e sugestões", async () => {
    const keys = ["totalStudents","activeStudents","inactiveStudents","newStudentsMonth","evaluationsToday","evaluationsWeek",
      "evaluationsMonth","evaluationsOverdue","evaluationsCompletedMonth","studentsWithoutEvaluation","birthdaysToday",
      "paymentOverdueCount","paymentDueIn3DaysCount","messagesToSendToday","scheduledMessages","messagesSentToday"];
    mock.rpc.mockResolvedValue({error:null,data:{version:1,generatedAt:"2026-10-13T12:00:00Z",day:"2026-10-13",
      stats:Object.fromEntries(keys.map(key=>[key,0])),actions:[],agenda:[],birthdayNames:[]}});
    const client = mount(<BothQueries/>);
    await waitFor(()=>expect(screen.getByText("0:0")).toBeInTheDocument());
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("get_workout_dashboard");
    client.clear();
  });
  it("exibe falha com botão de recuperação em vez de cartões zerados", async () => {
    mock.rpc.mockResolvedValue({data:null,error:{message:"database unavailable"}});
    const client = mount(<StatsOverview/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível atualizar os números");
    expect(screen.getByRole("button",{name:"Tentar novamente"})).toBeInTheDocument();
    expect(screen.queryByText("Total de Alunos")).not.toBeInTheDocument();
    client.clear();
  });
});
