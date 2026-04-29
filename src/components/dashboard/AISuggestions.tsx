
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Users, MessageCircle, Calendar, TrendingUp } from "lucide-react";
import { useTodayActions, useDashboardStats } from "@/hooks/useDashboardData";

export function AISuggestions() {
  const { data: todayActions = [], isLoading: actionsLoading } = useTodayActions();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  const generateSuggestions = () => {
    const suggestions = [];

    // Aniversariantes hoje
    if (stats?.birthdaysToday && stats.birthdaysToday > 0) {
      suggestions.push({
        id: 'birthday',
        title: 'Enviar Parabéns de Aniversário',
        description: `${stats.birthdaysToday} aluno(s) fazem aniversário hoje. Que tal enviar uma mensagem especial?`,
        priority: 'high',
        icon: Calendar,
        action: 'Envie mensagens de parabéns para os aniversariantes de hoje',
        color: 'bg-purple-100 text-purple-700 border-purple-200'
      });
    }

    // Alunos precisando de acompanhamento
    const needsFollow = todayActions.filter(action => 
      action.type === 'daqui_7_dias' || action.type === 'daqui_21_dias'
    );
    if (needsFollow.length > 0) {
      suggestions.push({
        id: 'followup',
        title: 'Acompanhar Novos Alunos',
        description: `${needsFollow.length} aluno(s) precisam de mensagens de acompanhamento.`,
        priority: 'medium',
        icon: Users,
        action: 'Envie mensagens de acompanhamento para novos alunos',
        color: 'bg-blue-100 text-blue-700 border-blue-200'
      });
    }

    // Avaliações pendentes
    const needsEvaluation = todayActions.filter(action => action.type === 'evaluation');
    if (needsEvaluation.length > 0) {
      suggestions.push({
        id: 'evaluation',
        title: 'Lembrar de Avaliações',
        description: `${needsEvaluation.length} aluno(s) precisam fazer avaliação física.`,
        priority: 'medium',
        icon: TrendingUp,
        action: 'Envie lembretes de avaliação física',
        color: 'bg-orange-100 text-orange-700 border-orange-200'
      });
    }

    // Mensagens motivacionais gerais
    if (stats?.totalStudents && stats.totalStudents > 0) {
      suggestions.push({
        id: 'motivation',
        title: 'Motivar Todos os Alunos',
        description: 'Envie uma mensagem motivacional geral para manter o engajamento.',
        priority: 'low',
        icon: MessageCircle,
        action: 'Envie uma mensagem motivacional para todos os alunos',
        color: 'bg-green-100 text-green-700 border-green-200'
      });
    }

    // Sugestão de criação de mensagem pré-definida se não houver muitas ações
    if (suggestions.length < 2) {
      suggestions.push({
        id: 'predefined',
        title: 'Criar Mensagem Pré-definida',
        description: 'Crie templates de mensagens para facilitar o envio futuro.',
        priority: 'low',
        icon: MessageCircle,
        action: 'Crie uma nova mensagem pré-definida',
        color: 'bg-gray-100 text-gray-700 border-gray-200'
      });
    }

    return suggestions.slice(0, 3); // Mostrar no máximo 3 sugestões
  };

  const suggestions = generateSuggestions();

  if (statsLoading || actionsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Sugestões da IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSuggestionClick = (action: string) => {
    // Redirecionar para a página do assistente IA com a ação pré-preenchida
    const chatInput = document.querySelector('input[placeholder*="Digite sua pergunta"]') as HTMLInputElement;
    if (chatInput) {
      chatInput.value = action;
      chatInput.focus();
    }
    
    // Se não estiver na página do assistente, redirecionar
    if (window.location.pathname !== '/assistente-ia') {
      window.location.href = '/assistente-ia';
      // Armazenar a ação no localStorage para usar depois
      localStorage.setItem('aiSuggestionAction', action);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Sugestões da IA
        </CardTitle>
        <CardDescription>
          Ações recomendadas baseadas nos seus dados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.length === 0 ? (
          <div className="text-center py-4">
            <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Tudo em dia! Não há sugestões específicas no momento.
            </p>
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div key={suggestion.id} className={`p-3 rounded-lg border ${suggestion.color}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <suggestion.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{suggestion.title}</h4>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${
                        suggestion.priority === 'high' ? 'bg-red-100 text-red-700' :
                        suggestion.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {suggestion.priority === 'high' ? 'Urgente' : 
                       suggestion.priority === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {suggestion.description}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => handleSuggestionClick(suggestion.action)}
                  >
                    Usar Assistente IA
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
