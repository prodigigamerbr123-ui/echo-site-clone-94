import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, MessageSquare, Clock, Send, History, Zap } from "lucide-react";
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
        to: "/alunos",
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
        to: "/enviar-mensagem",
        icon: Send,
        label: "Enviar Agora",
        className:
          "bg-gradient-to-br from-[hsl(var(--success))] to-[hsl(142_70%_45%)] text-[hsl(var(--success-foreground))] shadow-[0_4px_20px_-2px_hsl(var(--success)/0.25)] hover:shadow-elegant hover:-translate-y-0.5",
      },
      {
        to: "/agendar-mensagem",
        icon: Clock,
        label: "Agendar",
        className:
          "bg-card border border-border hover:border-[hsl(var(--success))]/40 hover:bg-accent text-foreground",
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
          "bg-card border border-border hover:border-primary/40 hover:bg-accent text-foreground",
      },
      {
        to: "/mensagens-enviadas",
        icon: History,
        label: "Histórico",
        className:
          "bg-card border border-border hover:border-primary/40 hover:bg-accent text-foreground",
      },
    ],
  },
];

export function QuickActions() {
  return (
    <Card className="overflow-hidden border-primary/10 shadow-card">
      <CardContent className="pt-6">
        <div className="grid gap-6 md:grid-cols-3">
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
