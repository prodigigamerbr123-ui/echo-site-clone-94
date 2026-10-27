import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";
import { lazyPage, PageImportError, reloadIfNewerBuild } from "@/lib/lazyPage";

const suppressExpectedError = (event: ErrorEvent) => {
  if (event.error instanceof PageImportError || event.error?.message === "private-server-detail") event.preventDefault();
};
beforeEach(() => window.addEventListener("error",suppressExpectedError));
afterEach(() => { cleanup(); window.removeEventListener("error",suppressExpectedError); vi.restoreAllMocks(); });
describe("route recovery", () => {
  it("shows a recovery control after a missing dynamic module without automatic reloads", async () => {
    vi.spyOn(console,"error").mockImplementation(() => undefined);
    const loader = vi.fn().mockRejectedValue(new Error("Failed to fetch dynamically imported module: private-path"));
    const Page = lazyPage(loader);
    const reload = vi.fn();
    render(<MemoryRouter><RouteErrorBoundary onReload={reload}><Suspense fallback={<p>Carregando</p>}><Page /></Suspense></RouteErrorBoundary></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir esta tela");
    expect(screen.queryByText(/private-path/)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{ name: "Recarregar página" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it("contains runtime failures and clears the error when navigating to another route", async () => {
    vi.spyOn(console,"error").mockImplementation(() => undefined);
    function Broken(): never { throw new Error("private-server-detail"); }
    render(<MemoryRouter initialEntries={["/broken"]}><Link to="/healthy">Outra tela</Link><RouteErrorBoundary><Routes>
      <Route path="/broken" element={<Broken />} /><Route path="/healthy" element={<h1>Tela disponível</h1>} />
    </Routes></RouteErrorBoundary></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Esta página encontrou um erro");
    expect(screen.queryByText(/private-server-detail/)).toBeNull();
    fireEvent.click(screen.getByRole("link",{ name: "Outra tela" }));
    expect(await screen.findByRole("heading",{ name: "Tela disponível" })).toBeInTheDocument();
  });
  it("renders successful lazy modules normally", async () => {
    const Page = lazyPage(async () => ({ default: () => <h1>Página carregada</h1> }));
    render(<MemoryRouter><RouteErrorBoundary><Suspense fallback={<p>Carregando</p>}><Page /></Suspense></RouteErrorBoundary></MemoryRouter>);
    expect(await screen.findByRole("heading",{ name: "Página carregada" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("reload after a new deploy", () => {
  const page = (entry: string) => ({ ok: true, text: async () => `<script type="module" src="/assets/${entry}"></script>` }) as Response;
  let script: HTMLScriptElement;
  beforeEach(() => {
    sessionStorage.clear();
    script = document.createElement("script");
    script.src = "https://workout.test/assets/index-old111.js";
    document.head.appendChild(script);
  });
  afterEach(() => script.remove());

  it("reloads once when a newer build is published, never twice for the same build", async () => {
    const reload = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(page("index-new222.js"));
    expect(await reloadIfNewerBuild(reload, fetcher)).toBe(true);
    expect(await reloadIfNewerBuild(reload, fetcher)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the manual screen when the published build is unchanged or unreachable", async () => {
    const reload = vi.fn();
    expect(await reloadIfNewerBuild(reload, vi.fn().mockResolvedValue(page("index-old111.js")))).toBe(false);
    expect(await reloadIfNewerBuild(reload, vi.fn().mockRejectedValue(new Error("offline")))).toBe(false);
    expect(await reloadIfNewerBuild(reload, vi.fn().mockResolvedValue({ ok: false } as Response))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
