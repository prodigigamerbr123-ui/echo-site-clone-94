import Mensagens from "@/pages/Mensagens";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  students: [
    { id: "a", name: "Ana", phone: "43999990000", had_evaluation: false, messages_enabled: true, status: "active" },
    { id: "b", name: "Bruno", phone: "43999990001", had_evaluation: false, messages_enabled: true, status: "active" },
  ], enqueue: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/useMessageComposerData", () => ({ useMessageComposerData: () => ({ students: fixture.students, predefinedMessages: [], loading: false, loadError: null, refetch: vi.fn() }) }));
vi.mock("@/lib/messageQueue", () => ({ enqueueMessages: fixture.enqueue }));
vi.mock("@/hooks/useMessageReviewQueue", () => ({ useMessageReviewQueue: () => ({ data: [], isPending: false, isFetching: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fixture.toast }) }));
beforeEach(() => {
  vi.clearAllMocks();
  fixture.students = [
    { id: "a", name: "Ana", phone: "43999990000", had_evaluation: false, messages_enabled: true, status: "active" },
    { id: "b", name: "Bruno", phone: "43999990001", had_evaluation: false, messages_enabled: true, status: "active" },
  ];
  fixture.enqueue.mockResolvedValue({ queued: 1, replayed: false, requestId: "fixture" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const page = () => <MemoryRouter><Mensagens /></MemoryRouter>;
it("finds recipients by accented name and formatted phone while keeping hidden selections", () => {
  fixture.students[0] = { ...fixture.students[0], name: "João da Silva" };
  render(page());
  fireEvent.click(screen.getByText("Bruno"));
  const search = screen.getByPlaceholderText("Buscar...");
  fireEvent.change(search, { target: { value: "joao   da" } });
  expect(screen.getByText("João da Silva")).toBeVisible();
  expect(screen.queryByText("Bruno")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "(43) 99999-0000" } });
  expect(screen.getByText("João da Silva")).toBeVisible();
  fireEvent.change(search, { target: { value: "" } });
  expect(screen.getByRole("checkbox", { name: "Selecionar Bruno" })).toBeChecked();
});
function review() {
  fireEvent.click(screen.getByText("Ana"));
  fireEvent.change(screen.getByLabelText("Conteúdo"), { target: { value: "Olá {nome}" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferir envio (1)" }));
  return screen.getByRole("dialog");
}

function scheduledReview() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  render(page());
  fireEvent.click(screen.getByText("Ana"));
  fireEvent.change(screen.getByLabelText("Conteúdo"), { target: { value: "Oi" } });
  fireEvent.click(screen.getByRole("button", { name: "Agendar" }));
  fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
  fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-20" } });
  fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "10:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferir agendamento (1)" }));
}

it("rechecks an expired date before the first confirmation", async () => {
  scheduledReview();
  expect(screen.getByText("20/10/2026, 10:00")).toBeVisible();
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("futura");
  expect(fixture.enqueue).not.toHaveBeenCalled();
});

it("allows server replay after an ambiguous failure even when the original date has elapsed", async () => {
  fixture.enqueue.mockRejectedValueOnce(new Error("Sem conexão"));
  scheduledReview();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  await screen.findByRole("alert");
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(fixture.enqueue).toHaveBeenCalledTimes(2);
  expect(fixture.enqueue.mock.calls[0]).toEqual(fixture.enqueue.mock.calls[1]);
});

it("requires review even for one recipient and preserves the draft when returning", () => {
  render(page());
  const dialog = review();
  expect(within(dialog).getByText("1 aluno(s) · 1 mensagem(ns) previstas")).toBeVisible();
  expect(within(dialog).getByText("Olá Ana")).toBeVisible();
  expect(fixture.enqueue).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Voltar e editar" }));
  expect(screen.getByLabelText("Conteúdo")).toHaveValue("Olá {nome}");
  expect(screen.getByRole("checkbox", { name: "Selecionar Ana" })).toBeChecked();
});

it("keeps the result visible and starts a new blank draft only after an explicit action", async () => {
  render(page()); review();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  expect(await screen.findByRole("region", { name: "Resultado da programação" })).toHaveTextContent("1 mensagem(ns) registrada(s)");
  expect(screen.queryByLabelText("Conteúdo")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preparar outra mensagem" }));
  expect(screen.getByLabelText("Conteúdo")).toHaveValue("");
  expect(screen.getByRole("checkbox", { name: "Selecionar Ana" })).not.toBeChecked();
  expect(fixture.enqueue).toHaveBeenCalledOnce();
});

it("keeps the review and the same payload available after a network failure", async () => {
  fixture.enqueue.mockRejectedValueOnce(new Error("Sem conexão"));
  render(page()); review();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão");
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(fixture.enqueue.mock.calls[0]).toEqual(fixture.enqueue.mock.calls[1]);
});

it("requires acknowledgement of shared WhatsApp and inactive recipients", () => {
  fixture.students[1] = { ...fixture.students[1], phone: "43999990000", status: "inactive" };
  render(page());
  fireEvent.click(screen.getByRole("checkbox", { name: /Incluir alunos inativos/ }));
  fireEvent.click(screen.getByRole("button", { name: "Todos" }));
  fireEvent.change(screen.getByLabelText("Conteúdo"), { target: { value: "Oi" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferir envio (2)" }));
  const confirm = screen.getByRole("button", { name: "Confirmar e colocar na fila" });
  expect(confirm).toBeDisabled();
  expect(screen.getByText(/Cada cadastro gera suas próprias mensagens/)).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: /Conferi os destinatários/ }));
  expect(confirm).toBeEnabled();
});

it("stops confirmation if a contact changes while review is open", async () => {
  const view = render(page()); review();
  fixture.students = fixture.students.map(student => student.id === "a" ? { ...student, messages_enabled: false } : student);
  view.rerender(page());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar e colocar na fila" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("dados de um destinatário mudaram");
  expect(fixture.enqueue).not.toHaveBeenCalled();
});

it("accepts only one confirmation while a request is pending", async () => {
  let finish!: (result: { queued: number }) => void;
  fixture.enqueue.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(page()); review();
  const confirm = screen.getByRole("button", { name: "Confirmar e colocar na fila" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(fixture.enqueue).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Voltar e editar" })).toBeDisabled();
  finish({ queued: 1 });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("keeps inactive students out of the default list and drops them when hidden again", () => {
  fixture.students[1] = { ...fixture.students[1], status: "inactive" };
  render(page());
  expect(screen.queryByText("Bruno")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Todos" }));
  expect(screen.getByText("Selecionar Alunos (1)")).toBeInTheDocument();
  const include = screen.getByRole("checkbox", { name: "Incluir alunos inativos (1)" });
  fireEvent.click(include);
  expect(screen.getByText("Inativo")).toBeVisible();
  fireEvent.click(screen.getByText("Bruno"));
  expect(screen.getByText("Selecionar Alunos (2)")).toBeInTheDocument();
  fireEvent.click(include);
  expect(screen.queryByText("Bruno")).not.toBeInTheDocument();
  expect(screen.getByText("Selecionar Alunos (1)")).toBeInTheDocument();
});

it("shows an inactive student opened from the record", () => {
  fixture.students[1] = { ...fixture.students[1], status: "inactive" };
  render(<MemoryRouter initialEntries={["/mensagens?aluno=b"]}><Mensagens /></MemoryRouter>);
  expect(screen.getByRole("checkbox", { name: "Selecionar Bruno" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Incluir alunos inativos/ })).toBeChecked();
});
