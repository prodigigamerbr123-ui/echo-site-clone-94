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

const groups: { title: string; description: string; actions: Action[] }[] = [
  {
    title: "Alunos",
    description: "Gerenciar sua base de alunos",
    actions: [
      {
        to: "/cadastrar-aluno",
        icon: UserPlus,
        label: "Cadastrar Aluno",
        className:
          "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-primary hover:shadow-elegant hover:-translate-y-0.5",
      },
      {
        to: "/alunos?tab=lista",
        icon: Users,
        label: "Ver Alunos",
        className:
          "bg-card border border-border hover:border-primary/40 hover:bg-accent text-foreground",
      },
    ],
  },
  {
    title: "Mensagens",
    description: "Enviar e programar comunicações",
    actions: [
      {
        to: "/mensagens",
        icon: Send,
        label: "Enviar mensagem",
        className:
          "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_20px_-2px_hsl(160_70%_40%/0.35)] hover:shadow-elegant hover:-translate-y-0.5",
      },
    ],
  },
  {
    title: "Conteúdo & Histórico",
    description: "Templates e mensagens enviadas",
    actions: [
      {
        to: "/mensagens-predefinidas",
        icon: MessageSquare,
        label: "Pré-definidas",
        className:
          "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-[0_4px_20px_-2px_hsl(217_80%_50%/0.35)] hover:shadow-elegant hover:-translate-y-0.5",
      },
      {
        to: "/caixa-de-saida",
        icon: History,
        label: "Histórico",
        className:
          "bg-card border border-border hover:border-sky-500/40 hover:bg-accent text-foreground",
      },
    ],
  },
  {
    title: "Avaliação Física",
    description: "Agendar e revisar avaliações",
    actions: [
      {
        to: "/agendar-avaliacao",
        icon: CalendarPlus,
        label: "Agendar",
        className:
          "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_4px_20px_-2px_hsl(250_70%_50%/0.35)] hover:shadow-elegant hover:-translate-y-0.5",
      },
      {
        to: "/avaliacao-fisica",
        icon: ClipboardList,
        label: "Histórico",
        className:
          "bg-card border border-border hover:border-violet-500/40 hover:bg-accent text-foreground",
      },
    ],
  },
  {
    title: "Ferramentas",
    description: "IA e conexão do WhatsApp",
    actions: [
      {
        to: "/assistente-ia",
        icon: Bot,
        label: "Assistente IA",
        className:
          "bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-[0_4px_20px_-2px_hsl(322_75%_50%/0.35)] hover:shadow-elegant hover:-translate-y-0.5",
      },
      {
        to: "/whatsapp",
        icon: MessageCircle,
        label: "WhatsApp",
        className:
          "bg-card border border-border hover:border-fuchsia-500/40 hover:bg-accent text-foreground",
      },
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
                    className={`h-auto flex-col gap-2 p-4 transition-all ${action.className}`}
                  >
                    <Link to={action.to}>
                      <action.icon className="h-5 w-5" />
                      <span className="text-xs font-medium text-center leading-tight">
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
