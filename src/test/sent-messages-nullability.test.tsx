import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MessagesList from "@/components/mensagens/MessagesList";
import { filterSentMessages, type Message } from "@/components/mensagens/sentMessageFilters";

const message: Message = {
  id: "message-fixture",
  content: "Avaliação agendada",
  status: null,
  sent_at: "2026-10-15T12:00:00Z",
  student_id: "student-fixture",
  students: null,
};

afterEach(cleanup);

describe("mensagens com campos opcionais do banco", () => {
  it("renderiza uma relação ausente e status indisponível sem inventar resultado", () => {
    render(<MessagesList messages={[message]} searchTerm="" dateFilter="all" customDateRange={{}} />);
    expect(screen.getByText("Aluno não encontrado")).toBeInTheDocument();
    expect(screen.getByText("Status indisponível")).toBeInTheDocument();
    expect(screen.getByText(message.content)).toBeInTheDocument();
    expect(screen.queryByText("Enviado")).not.toBeInTheDocument();
  });

  it("filtra pelo conteúdo e destinatário mesmo sem dados da relação", () => {
    expect(filterSentMessages([message], "avaliação", "all", {}, [message.student_id])).toEqual([message]);
    expect(filterSentMessages([message], "outro conteúdo", "all", {})).toEqual([]);
    expect(filterSentMessages([message], "", "all", {}, ["other-student"])).toEqual([]);
  });
});
