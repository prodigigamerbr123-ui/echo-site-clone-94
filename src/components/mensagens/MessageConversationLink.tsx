import { Button } from "@/components/ui/button";
import { formatPhoneBR } from "@/lib/phone";

export function MessageConversationLink({ phone }: { phone: string | null | undefined }) {
  const parsed = formatPhoneBR(phone);
  if (!parsed.ok || !/^55\d{10,11}$/.test(parsed.number)) {
    return <p className="text-xs text-muted-foreground">Telefone indisponível para abrir a conversa. Confira o cadastro do aluno.</p>;
  }
  return <div className="space-y-1">
    <Button asChild size="sm" variant="outline"><a href={`https://wa.me/${parsed.number}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir conversa no WhatsApp</a></Button>
    <p className="text-xs text-muted-foreground">Abre a conversa em outra aba, sem preencher ou enviar mensagem. Confira o texto e o horário no histórico.</p>
  </div>;
}
