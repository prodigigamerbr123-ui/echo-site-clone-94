import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ role: "admin", health: { state: "open" as string | undefined, connected: true, disconnected: false } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: fixture.role }) }));
vi.mock("@/hooks/useWhatsAppHealth", () => ({ useWhatsAppHealth: () => fixture.health }));

afterEach(() => {
  cleanup();
  fixture.role = "admin";
  fixture.health = { state: "open", connected: true, disconnected: false };
});

const setup = () => render(<MemoryRouter><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);

describe("app sidebar", () => {
  it("starts with the daily routine and moves the WhatsApp connection to maintenance", () => {
    setup();
    const links = screen.getAllByRole("link").map(link => link.getAttribute("href"));
    expect(links.slice(0, 2)).toEqual(["/", "/alunos"]);
    expect(links.indexOf("/whatsapp")).toBeGreaterThan(links.indexOf("/assistente-ia"));
    expect(screen.getByRole("link", { name: /Início/ })).toBeInTheDocument();
  });

  it("shows the WhatsApp status on the menu item", () => {
    fixture.health = { state: "close", connected: false, disconnected: true };
    setup();
    expect(screen.getByRole("link", { name: /Conexão WhatsApp/ })).toHaveTextContent("Status: desconectado");
  });

  it("hides the WhatsApp item for roles without access", () => {
    fixture.role = "avaliador";
    setup();
    expect(screen.queryByRole("link", { name: /Conexão WhatsApp/ })).not.toBeInTheDocument();
  });
});
