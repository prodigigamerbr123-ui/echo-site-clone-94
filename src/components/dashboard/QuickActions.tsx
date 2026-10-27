import { Button } from "@/components/ui/button";
import { CalendarPlus, Send, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canVisit } from "@/lib/staffRoles";

// Só as três tarefas mais frequentes; o restante da navegação fica no menu lateral.
const actions = [
  { to: "/cadastrar-aluno", icon: UserPlus, label: "Cadastrar aluno", primary: true },
  { to: "/agendar-avaliacao", icon: CalendarPlus, label: "Agendar avaliação", primary: false },
  { to: "/mensagens", icon: Send, label: "Enviar mensagem", primary: false },
];

export function QuickActions() {
  const { role } = useAuth();
  const visible = actions.filter(action => import.meta.env.VITE_PREVIEW_MODE === "true" || canVisit(role, action.to));
  if (visible.length === 0) return null;
  return (
    <nav aria-label="Ações principais" className="grid gap-2 sm:flex sm:flex-wrap">
      {visible.map(action => (
        <Button key={action.to} asChild variant={action.primary ? "default" : "outline"} className="h-11 justify-start gap-2 sm:justify-center">
          <Link to={action.to}><action.icon className="h-4 w-4" />{action.label}</Link>
        </Button>
      ))}
    </nav>
  );
}
