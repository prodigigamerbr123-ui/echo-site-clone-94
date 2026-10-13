import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { StrictMode } from "react";
import AssistenteIA from "@/pages/AssistenteIA";
import { AIChat } from "@/components/ai-assistant/AIChat";
import {
  chatHistory,
  chatReply,
  recentChatContext,
  type StoredChatMessage,
  type ChatReply,
} from "../../supabase/functions/_shared/aiChatContracts";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "fixture-owner" }, role: "admin" }),
}));
const conversations = new Map<
  string,
  { id: string; title: string; updated_at: string }
>();
const histories = new Map<string, StoredChatMessage[]>();
const clients: QueryClient[] = [];
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}
function conversation(messages: StoredChatMessage[] = []) {
  const id = randomUUID();
  conversations.set(id, {
    id,
    title: "Conversa fixture",
    updated_at: new Date().toISOString(),
  });
  histories.set(id, messages);
  return id;
}
function serverResponse(body: Record<string, unknown>, reply: ChatReply) {
  const id = String(body.conversationId),
    messageId = String(body.responseMessageId);
  const decision = body.confirmedAction ?? body.rejectedAction;
  const rows = histories.get(id) ?? [];
  if (decision && reply.actionState)
    rows.forEach((m) => {
      if (m.pendingAction) m.actionState = reply.actionState;
    });
  if (reply.historySaved === true)
    rows.push({
      id: messageId,
      role: "assistant",
      content: reply.message,
      pendingAction: reply.pendingAction,
      actionState: reply.pendingAction ? reply.actionState : undefined,
    });
  histories.set(id, rows);
  return { data: reply, error: null };
}
beforeEach(() => {
  vi.clearAllMocks();
  conversations.clear();
  histories.clear();
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID });
  mocks.from.mockImplementation((table: string) => {
    if (table !== "ai_conversations")
      throw new Error("Unexpected table " + table);
    let filter: string | undefined;
    const builder = {
      select: () => builder,
      eq: (_column: string, id: string) => {
        filter = id;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      upsert: (row: { id: string; title: string }) => {
        if (!conversations.has(row.id))
          conversations.set(row.id, {
            ...row,
            updated_at: new Date().toISOString(),
          });
        filter = row.id;
        return builder;
      },
      maybeSingle: async () => ({
        data: filter
          ? (conversations.get(filter) ?? null)
          : (conversations.values().next().value ?? null),
        error: null,
      }),
      range: async (from: number, to: number) => ({
        data: [...conversations.values()].slice(from, to + 1),
        count: conversations.size,
        error: null,
      }),
    };
    return builder;
  });
  mocks.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      if (name === "get_ai_conversation_history")
        return {
          data: {
            version: 1,
            messages: histories.get(String(args._conversation_id)) ?? [],
          },
          error: null,
        };
      if (name === "append_ai_message_tx") {
        const id = String(args._conversation_id),
          rows = histories.get(id) ?? [];
        if (!rows.some((m) => m.id === args._id))
          rows.push({
            id: String(args._id),
            role: args._role as "user" | "assistant",
            content: String(args._content),
          });
        histories.set(id, rows);
        return { data: args._id, error: null };
      }
      throw new Error("Unexpected RPC " + name);
    },
  );
  mocks.invoke.mockImplementation(
    async (_name: string, { body }: { body: Record<string, unknown> }) =>
      serverResponse(body, { message: "Resposta fixture", historySaved: true }),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.unstubAllGlobals();
});
async function send(text = "Pergunta fixture") {
  const input = await screen.findByRole("textbox", {
    name: "Mensagem para o assistente",
  });
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar mensagem ao assistente" }),
  );
}
const proposal = () => ({
  id: randomUUID(),
  tool: "create_student",
  args: { name: "Fixture", phone: "fixture" },
  description: "Criar aluno Fixture",
});

describe("conversas de IA sem chamadas reais ao provedor", () => {
  it("mantém a primeira resposta ao adotar o ID da conversa no componente pai", async () => {
    let finish!: () => void;
    mocks.invoke.mockImplementation(
      (_name: string, { body }: { body: Record<string, unknown> }) =>
        new Promise((resolve) => {
          finish = () =>
            resolve(
              serverResponse(body, {
                message: "Primeira resposta preservada.",
                historySaved: true,
              }),
            );
        }),
    );
    mount(<AssistenteIA />);
    await send();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Nova conversa" }),
    ).toBeDisabled();
    await act(async () => finish());
    expect(
      await screen.findByText("Primeira resposta preservada."),
    ).toBeInTheDocument();
    expect(conversations.size).toBe(1);
    expect(
      [...histories.values()][0].filter((m) => m.role === "user"),
    ).toHaveLength(1);
    expect(
      [...histories.values()][0].filter((m) => m.role === "assistant"),
    ).toHaveLength(1);
  });
  it("preserva a pergunta e não chama a IA quando o salvamento falha", async () => {
    const normal = mocks.rpc.getMockImplementation()!;
    let fail = true;
    mocks.rpc.mockImplementation(
      (name: string, args: Record<string, unknown>) => {
        if (name === "append_ai_message_tx" && args._role === "user" && fail) {
          fail = false;
          return Promise.resolve({
            data: null,
            error: { message: "Banco indisponível" },
          });
        }
        return normal(name, args);
      },
    );
    mount(<AIChat isExpanded />);
    await send("Pergunta preservada");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Banco indisponível",
    );
    expect(screen.getByRole("textbox")).toHaveValue("Pergunta preservada");
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar e enviar pergunta" }),
    );
    expect(await screen.findByText("Resposta fixture")).toBeInTheDocument();
    const writes = mocks.rpc.mock.calls.filter(
      ([name, args]) =>
        name === "append_ai_message_tx" && args._role === "user",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0][1]._id).toBe(writes[1][1]._id);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("tenta salvar uma resposta sem gerar outra chamada à IA", async () => {
    const normal = mocks.rpc.getMockImplementation()!;
    let fail = true;
    mocks.rpc.mockImplementation(
      (name: string, args: Record<string, unknown>) => {
        if (
          name === "append_ai_message_tx" &&
          args._role === "assistant" &&
          fail
        ) {
          fail = false;
          return Promise.resolve({
            data: null,
            error: { message: "Save failed" },
          });
        }
        return normal(name, args);
      },
    );
    mocks.invoke.mockImplementation(
      async (_name: string, { body }: { body: Record<string, unknown> }) =>
        serverResponse(body, {
          message: "Resposta ainda não salva",
          historySaved: false,
        }),
    );
    mount(<AIChat isExpanded />);
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "salvamento não foi confirmado",
    );
    expect(screen.getByText("Resposta ainda não salva")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar resposta" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const writes = mocks.rpc.mock.calls.filter(
      ([name, args]) =>
        name === "append_ai_message_tx" && args._role === "assistant",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0][1]._id).toBe(writes[1][1]._id);
  });
  it("não marca uma falha de execução retornada com HTTP 200 como executada", async () => {
    const action = proposal(),
      id = conversation([
        {
          id: randomUUID(),
          role: "assistant",
          content: "Confirme",
          pendingAction: action,
          actionState: "pending",
        },
      ]);
    mocks.invoke.mockImplementation(
      async (_name: string, { body }: { body: Record<string, unknown> }) =>
        serverResponse(body, {
          message: "Não foi possível executar.",
          actionState: "failed",
          historySaved: true,
        }),
    );
    mount(<AIChat isExpanded conversationId={id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    expect(
      await screen.findByText(
        "Execução falhou. Confira os registros antes de solicitar outra proposta.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Executado.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirmar" }),
    ).not.toBeInTheDocument();
  });
  it("registra o cancelamento no servidor e o recupera ao reabrir o chat", async () => {
    const action = proposal(),
      id = conversation([
        {
          id: randomUUID(),
          role: "assistant",
          content: "Confirme",
          pendingAction: action,
          actionState: "pending",
        },
      ]);
    mocks.invoke.mockImplementation(
      async (_name: string, { body }: { body: Record<string, unknown> }) =>
        serverResponse(body, {
          message: "Proposta cancelada no servidor.",
          actionState: "rejected",
          historySaved: true,
        }),
    );
    const rendered = mount(<AIChat isExpanded conversationId={id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Cancelado.")).toBeInTheDocument();
    expect(mocks.invoke.mock.calls[0][1].body.rejectedAction).toEqual({
      id: action.id,
    });
    rendered.unmount();
    mount(<AIChat isExpanded conversationId={id} />);
    expect(await screen.findByText("Cancelado.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirmar" }),
    ).not.toBeInTheDocument();
  });
  it("ignora uma resposta de histórico atrasada de outra conversa", async () => {
    const first = conversation(),
      second = conversation([
        { id: randomUUID(), role: "user", content: "Histórico atual" },
      ]);
    let finish!: () => void;
    const normal = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(
      (name: string, args: Record<string, unknown>) => {
        if (
          name === "get_ai_conversation_history" &&
          args._conversation_id === first
        )
          return new Promise((resolve) => {
            finish = () =>
              resolve({
                data: {
                  version: 1,
                  messages: [
                    {
                      id: randomUUID(),
                      role: "user",
                      content: "Histórico antigo",
                    },
                  ],
                },
                error: null,
              });
          });
        return normal(name, args);
      },
    );
    const view = mount(<AIChat isExpanded conversationId={first} />);
    view.rerender(
      <QueryClientProvider client={clients[0]}>
        <AIChat isExpanded conversationId={second} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Histórico atual")).toBeInTheDocument();
    await act(async () => finish());
    expect(screen.queryByText("Histórico antigo")).not.toBeInTheDocument();
  });
  it("exibe falha no histórico e desabilita envios até recuperar os dados, inclusive em StrictMode", async () => {
    const id = conversation([
      { id: randomUUID(), role: "user", content: "Histórico recuperado" },
    ]);
    const normal = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(
      async (name: string, args: Record<string, unknown>) =>
        name === "get_ai_conversation_history"
          ? { data: null, error: { message: "Histórico indisponível" } }
          : normal(name, args),
    );
    mount(
      <StrictMode>
        <AIChat isExpanded conversationId={id} />
      </StrictMode>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Histórico indisponível",
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.rpc.mockImplementation(normal);
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar histórico" }),
    );
    expect(await screen.findByText("Histórico recuperado")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  });
  it("envia somente as 40 mensagens recentes e preserva o histórico completo", () => {
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      id: randomUUID(),
      role: "user" as const,
      content: "Mensagem " + i,
    }));
    expect(chatHistory({ version: 1, messages: rows })).toHaveLength(1005);
    const context = recentChatContext(rows);
    expect(context).toHaveLength(40);
    expect(context[0].content).toBe("Mensagem 965");
    expect(rows).toHaveLength(1005);
  });
  it("recusa respostas e estados malformados antes de mostrá-los como sucesso", () => {
    expect(() => chatReply({ message: { success: true } })).toThrow();
    expect(() =>
      chatReply({ message: "Confirme", pendingAction: proposal() }),
    ).toThrow();
    expect(() =>
      chatHistory({
        version: 1,
        messages: [{ id: randomUUID(), role: "system", content: "forged" }],
      }),
    ).toThrow();
    expect(() =>
      chatReply({ message: "Feito", actionState: "confirmed" }),
    ).toThrow();
  });
});
