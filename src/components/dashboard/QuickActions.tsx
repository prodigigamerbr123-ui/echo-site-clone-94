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
  tone: "primary" | "outline" | "whatsapp" | "whatsapp-outline";
};

const toneClass: Record<Action["tone"], string> = {
  primary:
    "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-primary hover:shadow-elegant hover:-translate-y-0.5",
  outline:
    "bg-card border border-border hover:border-primary/40 hover:bg-accent text-foreground",
  whatsapp:
    "bg-whatsapp text-whatsapp-foreground shadow-[0_4px_20px_-2px_hsl(var(--whatsapp)/0.35)] hover:shadow-elegant hover:-translate-y-0.5",
  "whatsapp-outline":
    "bg-card border border-border hover:border-whatsapp/50 hover:bg-whatsapp/10 text-foreground",
};

const groups: { title: string; description: string; actions: Action[] }[] = [
  {
    title: "Alunos",
    description: "Gerenciar sua base de alunos",
    actions: [
      { to: "/cadastrar-aluno", icon: UserPlus, label: "Cadastrar Aluno", tone: "primary" },
      { to: "/alunos?tab=lista", icon: Users, label: "Ver Alunos", tone: "outline" },
    ],
  },
  {
    title: "Mensagens",
    description: "Enviar e programar comunicações",
    actions: [
      { to: "/mensagens", icon: Send, label: "Enviar mensagem", tone: "whatsapp" },
      { to: "/mensagens?tab=agendar", icon: CalendarClock, label: "Agendar mensagem", tone: "whatsapp-outline" },
    ],
  },
  {
    title: "Conteúdo & Histórico",
    description: "Templates e mensagens enviadas",
    actions: [
      { to: "/mensagens-predefinidas", icon: MessageSquare, label: "Pré-definidas", tone: "primary" },
      { to: "/caixa-de-saida", icon: History, label: "Histórico", tone: "outline" },
    ],
  },
  {
    title: "Avaliação Física",
    description: "Agendar e revisar avaliações",
    actions: [
      { to: "/agendar-avaliacao", icon: CalendarPlus, label: "Agendar", tone: "primary" },
      { to: "/avaliacao-fisica", icon: ClipboardList, label: "Histórico", tone: "outline" },
    ],
  },
  {
    title: "Ferramentas",
    description: "IA e conexão do WhatsApp",
    actions: [
      { to: "/assistente-ia", icon: Bot, label: "Assistente IA", tone: "primary" },
      { to: "/whatsapp", icon: MessageCircle, label: "WhatsApp", tone: "whatsapp-outline" },
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
                    className={`h-full min-h-20 w-full min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal transition-all ${toneClass[action.tone]}`}
                  >
                    <Link to={action.to}>
                      <action.icon className="h-5 w-5 shrink-0" />
                      <span className="block max-w-full overflow-hidden break-words text-center text-xs font-medium leading-tight">
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
