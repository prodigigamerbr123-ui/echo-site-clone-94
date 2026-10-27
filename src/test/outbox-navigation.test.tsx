import CaixaDeSaida from "@/pages/CaixaDeSaida";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/mensagens/ScheduledList", () => ({ default: ({ statusFilter }: { statusFilter: string }) => <p>Filtro: {statusFilter}</p> }));
vi.mock("@/components/mensagens/MensagensEnviadasTab", () => ({ default: () => <p>Mensagens enviadas</p> }));
afterEach(cleanup);
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate("/caixa-de-saida?aba=falhas")}>Abrir falhas</button><output>{location.search}</output></>;
}
function setup(search: string) {
  render(<MemoryRouter initialEntries={[`/caixa-de-saida${search}`]}><CaixaDeSaida /><Navigation /></MemoryRouter>);
}
describe("outbox deep links", () => {
  it("opens uncertain delivery review directly", () => {
    setup("?aba=incertas");
    expect(screen.getByRole("tab", { name: "Conferir entrega" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Filtro: uncertain")).toBeInTheDocument();
    expect(screen.getByText(/A mensagem pode ter chegado/)).toBeVisible();
  });
  it("opens failures directly from the daily panel", () => {
    setup("?aba=falhas");
    expect(screen.getByRole("tab", { name: "Falhas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Filtro: failed")).toBeInTheDocument();
  });
  it("reacts to navigation without remounting and rejects unknown tabs", () => {
    setup("?aba=desconhecida");
    expect(screen.getByText("Filtro: pending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir falhas" }));
    expect(screen.getByText("Filtro: failed")).toBeInTheDocument();
  });
});
