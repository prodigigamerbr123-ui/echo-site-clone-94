import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserPlus,
  MessageSquare,
  
  Send,
  CalendarClock,
  History,
  CalendarPlus,
  ClipboardList,
  Bot,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";

type Action = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className: string;
};

const ACTION_STYLE =
  "bg-card border border-border text-foreground hover:border-primary/40 hover:bg-accent hover:-translate-y-0.5 hover:shadow-card";

const groups: { title: string; description: string; actions: Action[] }[] = [
  {
    title: "Alunos",
    description: "Gerenciar sua base de alunos",
    actions: [
      { to: "/cadastrar-aluno", icon: UserPlus, label: "Cadastrar Aluno", className: ACTION_STYLE },
      { to: "/alunos?tab=lista", icon: Users, label: "Ver Alunos", className: ACTION_STYLE },
    ],
  },
  {
    title: "Mensagens",
    description: "Enviar e programar comunicações",
    actions: [
      { to: "/mensagens", icon: Send, label: "Enviar mensagem", className: ACTION_STYLE },
      { to: "/mensagens?tab=agendar", icon: CalendarClock, label: "Agendar mensagem", className: ACTION_STYLE },
    ],
  },
  {
    title: "Conteúdo & Histórico",
    description: "Templates e mensagens enviadas",
    actions: [
      { to: "/mensagens-predefinidas", icon: MessageSquare, label: "Pré-definidas", className: ACTION_STYLE },
      { to: "/caixa-de-saida", icon: History, label: "Histórico", className: ACTION_STYLE },
    ],
  },
  {
    title: "Avaliação Física",
    description: "Agendar e revisar avaliações",
    actions: [
      { to: "/agendar-avaliacao", icon: CalendarPlus, label: "Agendar", className: ACTION_STYLE },
      { to: "/avaliacao-fisica", icon: ClipboardList, label: "Histórico", className: ACTION_STYLE },
    ],
  },
  {
    title: "Ferramentas",
    description: "IA e conexão do WhatsApp",
    actions: [
      { to: "/assistente-ia", icon: Bot, label: "Assistente IA", className: ACTION_STYLE },
      { to: "/whatsapp", icon: MessageCircle, label: "WhatsApp", className: ACTION_STYLE },
    ],
  },
];

export function QuickActions() {
  return (
    <Card className="overflow-hidden border-primary/10 shadow-card">
      <CardContent className="pt-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {groups.map((group) => (
            <div key={group.title} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.actions.map((action) => (
                  <Button
                    key={action.to}
                    asChild
                    size="sm"
                    variant="ghost"
                    className={`h-auto min-w-0 flex-col gap-2 whitespace-normal p-3 transition-all ${action.className}`}
                  >
                    <Link to={action.to}>
                      <action.icon className="h-5 w-5 shrink-0" />
                      <span className="w-full text-xs font-medium text-center leading-tight break-words">
                        {action.label}
                      </span>
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
