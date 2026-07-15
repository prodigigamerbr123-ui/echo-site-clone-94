import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Users,
  MessageCircle,
  Calendar,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Bot,
  RefreshCw,
  Dumbbell,
  Heart,
  ClipboardList,
} from "lucide-react";
import { useTodayActions, useDashboardStats } from "@/hooks/useDashboardData";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

type Priority = "high" | "medium" | "low";

interface Suggestion {
  id: string;
  title: string;
  description: string;
  example: string;
  priority: Priority;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
  accent: string; // gradient for icon
  border: string;
}

export function AISuggestions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [seed, setSeed] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data: todayActions = [], isLoading: actionsLoading } = useTodayActions();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["todayActions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboardStats"] }),
      ]);
      setSeed((s) => s + 1);
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  const extraPool: Suggestion[] = [
    {
      id: "hydration",
      title: "Lembrete de Hidratação",
      description: "Envie um lembrete rápido sobre hidratação e recuperação.",
      example: 'Ex.: "Crie uma mensagem curta lembrando os alunos de se hidratarem hoje."',
      priority: "low",
      icon: Heart,
      action: "Envie uma mensagem de lembrete de hidratação para todos os alunos",
      accent: "bg-gradient-to-br from-cyan-500 to-blue-600",
      border: "border-l-cyan-500",
    },
    {
      id: "training-tip",
      title: "Dica de Treino do Dia",
      description: "Compartilhe uma dica técnica para engajar os alunos.",
      example: 'Ex.: "Gere uma dica curta sobre execução de agachamento."',
      priority: "low",
      icon: Dumbbell,
      action: "Crie uma dica de treino do dia para enviar aos alunos",
      accent: "bg-gradient-to-br from-orange-500 to-red-600",
      border: "border-l-orange-500",
    },
    {
      id: "feedback",
      title: "Pedir Feedback dos Alunos",
      description: "Solicite feedback sobre treinos recentes para ajustar planos.",
      example: 'Ex.: "Crie uma mensagem pedindo feedback sobre a última semana de treinos."',
      priority: "low",
      icon: ClipboardList,
      action: "Envie uma mensagem pedindo feedback sobre os treinos da semana",
      accent: "bg-gradient-to-br from-indigo-500 to-purple-600",
      border: "border-l-indigo-500",
    },
    {
      id: "checkin",
      title: "Check-in Semanal",
      description: "Faça um check-in rápido para saber como estão os alunos.",
      example: 'Ex.: "Crie uma mensagem de check-in perguntando como foi a semana."',
      priority: "low",
      icon: MessageCircle,
      action: "Envie um check-in semanal para todos os alunos ativos",
      accent: "bg-gradient-to-br from-emerald-500 to-teal-600",
      border: "border-l-emerald-500",
    },
  ];

  const generateSuggestions = (): Suggestion[] => {
    const suggestions: Suggestion[] = [];

    if (stats?.birthdaysToday && stats.birthdaysToday > 0) {
      suggestions.push({
        id: "birthday",
        title: "Enviar Parabéns de Aniversário",
        description: `${stats.birthdaysToday} aluno(s) fazem aniversário hoje.`,
        example: `Ex.: "Gere uma mensagem carinhosa de parabéns para os ${stats.birthdaysToday} aniversariantes de hoje."`,
        priority: "high",
        icon: Calendar,
        action: `Envie mensagens de parabéns para os ${stats.birthdaysToday} aniversariante(s) de hoje`,
        accent: "bg-gradient-to-br from-purple-500 to-pink-600",
        border: "border-l-purple-500",
      });
    }

    const needsFollow = todayActions.filter(
      (a) => a.type === "daqui_7_dias" || a.type === "daqui_21_dias"
    );
    if (needsFollow.length > 0) {
      suggestions.push({
        id: "followup",
        title: "Acompanhar Novos Alunos",
        description: `${needsFollow.length} aluno(s) precisam de acompanhamento.`,
        example: `Ex.: "Crie uma mensagem de check-in para os ${needsFollow.length} alunos novos."`,
        priority: "medium",
        icon: Users,
        action: `Envie mensagens de acompanhamento para ${needsFollow.length} aluno(s) novo(s)`,
        accent: "bg-gradient-to-br from-blue-500 to-cyan-600",
        border: "border-l-blue-500",
      });
    }

    const needsEvaluation = todayActions.filter((a) => a.type === "evaluation");
    if (needsEvaluation.length > 0) {
      suggestions.push({
        id: "evaluation",
        title: "Lembrar de Avaliações Físicas",
        description: `${needsEvaluation.length} aluno(s) precisam fazer avaliação.`,
        example: `Ex.: "Lembre os ${needsEvaluation.length} alunos de marcarem a avaliação física comigo essa semana."`,
        priority: "high",
        icon: TrendingUp,
        action: `Envie lembretes de avaliação física para ${needsEvaluation.length} aluno(s)`,
        accent: "bg-gradient-to-br from-[hsl(var(--warning))] to-orange-600",
        border: "border-l-[hsl(var(--warning))]",
      });
    }

    if (stats?.totalStudents && stats.totalStudents > 0 && suggestions.length < 3) {
      suggestions.push({
        id: "motivation",
        title: "Motivar Todos os Alunos",
        description: "Envie uma mensagem motivacional geral para manter o engajamento.",
        example: 'Ex.: "Crie uma mensagem motivacional curta para começar bem a semana."',
        priority: "low",
        icon: MessageCircle,
        action: "Envie uma mensagem motivacional para todos os alunos",
        accent: "bg-gradient-to-br from-[hsl(var(--success))] to-emerald-600",
        border: "border-l-[hsl(var(--success))]",
      });
    }

    if (suggestions.length < 2) {
      suggestions.push({
        id: "predefined",
        title: "Criar Mensagem Pré-definida",
        description: "Crie templates para acelerar envios futuros.",
        example: 'Ex.: "Crie um template de boas-vindas para novos alunos."',
        priority: "low",
        icon: MessageCircle,
        action: "Crie uma nova mensagem pré-definida de boas-vindas",
        accent: "bg-gradient-to-br from-slate-500 to-slate-700",
        border: "border-l-slate-500",
      });
    }

    return suggestions.slice(0, 3);
  };

  const suggestions = generateSuggestions();
  const isLoading = statsLoading || actionsLoading;

  if (isLoading) {
    return (
      <Card className="border-primary/10 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Sugestões da IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-4 rounded-lg bg-muted/40">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSuggestionClick = (action: string) => {
    localStorage.setItem("aiSuggestionAction", action);
    navigate("/assistente-ia");
  };

  const priorityBadge = (priority: Priority) => {
    const map = {
      high: {
        label: "Urgente",
        className:
          "bg-destructive/10 text-destructive border-destructive/30 animate-pulse-glow-destructive",
      },
      medium: {
        label: "Médio",
        className: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
      },
      low: {
        label: "Sugerido",
        className: "bg-muted text-muted-foreground border-border",
      },
    };
    const cfg = map[priority];
    return (
      <Badge variant="outline" className={`text-[10px] font-semibold ${cfg.className}`}>
        {priority === "high" && <AlertCircle className="h-3 w-3 mr-1" />}
        {cfg.label}
      </Badge>
    );
  };

  return (
    <Card className="overflow-hidden border-primary/10 shadow-card">
      <CardHeader className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-purple-600 text-white shadow-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-lg">Sugestões da IA</CardTitle>
            <CardDescription>Ações inteligentes baseadas nos seus dados de hoje</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-3">
        {suggestions.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Tudo em dia! Não há sugestões específicas no momento.
            </p>
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className={`group p-4 rounded-lg border border-border bg-card border-l-4 ${suggestion.border} hover:shadow-elegant transition-all duration-300`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-lg shadow-md shrink-0 text-white ${suggestion.accent}`}
                >
                  <suggestion.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm text-foreground">{suggestion.title}</h4>
                    {priorityBadge(suggestion.priority)}
                  </div>
                  <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                  <p className="text-[11px] italic text-muted-foreground/80 bg-muted/40 px-2 py-1.5 rounded-md border border-border/50">
                    {suggestion.example}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleSuggestionClick(suggestion.action)}
                    className="w-full sm:w-auto gap-1.5 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-primary hover:shadow-elegant hover:-translate-y-0.5 transition-all"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Usar Assistente IA
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
