import { MessageQueueResult } from "@/components/mensagens/MessageQueueResult";
import { buildMessageReview } from "@/lib/messageReview";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const review = buildMessageReview([{ id: "a", name: "Ana", phone: "43999990000", had_evaluation: false }], "Olá {nome}", { kind: "now" });
afterEach(cleanup);
function setup(queued = 1, replayed = false) {
  const onNewMessage = vi.fn();
  render(<MemoryRouter><MessageQueueResult operation={{ review, queued, replayed }} onNewMessage={onNewMessage} /></MemoryRouter>);
  return onNewMessage;
}
it("shows the server-confirmed count and links to the queue and selected student's sheet", () => {
  const next = setup();
  expect(screen.getByRole("heading", { name: "Programação registrada" })).toBeVisible();
  expect(screen.getByText("1 mensagem(ns) registrada(s) nesta operação")).toBeVisible();
  expect(screen.getByRole("link", { name: "Abrir Caixa de saída" })).toHaveAttribute("href", "/caixa-de-saida?aba=agendadas");
  expect(screen.getByRole("link", { name: "Abrir ficha do aluno" })).toHaveAttribute("href", "/alunos?aluno=a");
  expect(screen.getByText(/entrega ou leitura no WhatsApp não foram confirmadas/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Preparar outra mensagem" }));
  expect(next).toHaveBeenCalledOnce();
});
it("explains a recovered response without claiming the messages are still pending", () => {
  setup(1, true);
  expect(screen.getByRole("heading", { name: "Confirmação recuperada" })).toBeVisible();
  expect(screen.getByText(/sem criar mensagens extras/)).toBeVisible();
});
it("shows a zero result and difference from the review without claiming a send happened", () => {
  setup(0);
  expect(screen.getByRole("heading", { name: "Nenhuma nova mensagem foi criada" })).toBeVisible();
  expect(screen.getByText(/A quantidade registrada difere da revisão/)).toBeVisible();
});
