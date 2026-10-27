import { Button } from "@/components/ui/button";
import { CalendarPlus, Send, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canVisit } from "@/lib/staffRoles";

// Só as três tarefas mais frequentes; o restante da navegação fica no menu lateral.
// Cores de cada área mantidas dos atalhos anteriores, a pedido do dono.
const lift = "text-white border-0 transition-all hover:-translate-y-0.5 hover:shadow-elegant hover:text-white";
const actions = [
  { to: "/cadastrar-aluno", icon: UserPlus, label: "Cadastrar aluno", className: `bg-gradient-to-br from-primary to-primary-glow shadow-primary ${lift}` },
  { to: "/agendar-avaliacao", icon: CalendarPlus, label: "Agendar avaliação", className: `bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_4px_20px_-2px_hsl(250_70%_50%/0.35)] ${lift}` },
  { to: "/mensagens", icon: Send, label: "Enviar mensagem", className: `bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_4px_20px_-2px_hsl(160_70%_40%/0.35)] ${lift}` },
];

export function QuickActions() {
  const { role } = useAuth();
  const visible = actions.filter(action => import.meta.env.VITE_PREVIEW_MODE === "true" || canVisit(role, action.to));
  if (visible.length === 0) return null;
  return (
    <nav aria-label="Ações principais" className="grid gap-2 sm:flex sm:flex-wrap">
      {visible.map(action => (
        <Button key={action.to} asChild className={`h-11 justify-start gap-2 sm:justify-center ${action.className}`}>
          <Link to={action.to}><action.icon className="h-4 w-4" />{action.label}</Link>
        </Button>
      ))}
    </nav>
  );
}
