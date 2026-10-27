import { MessageConversationLink } from "@/components/mensagens/MessageConversationLink";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

afterEach(cleanup);
it("opens only the normalized conversation, without a message body or automatic send", () => {
  render(<MessageConversationLink phone="(43) 99999-0000" />);
  const link = screen.getByRole("link", { name: "Abrir conversa no WhatsApp" });
  expect(link).toHaveAttribute("href", "https://wa.me/5543999990000");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(screen.getByText(/sem preencher ou enviar mensagem/)).toBeVisible();
});
it.each([undefined, null, "", "000", "https://example.invalid", "123456789012"])("does not offer an invalid conversation URL for %s", phone => {
  render(<MessageConversationLink phone={phone} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText(/Telefone indisponível/)).toBeVisible();
});
