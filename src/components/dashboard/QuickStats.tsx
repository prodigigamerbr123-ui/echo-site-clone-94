
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTodayActions } from "@/hooks/useDashboardData";

export function QuickStats() {
  const { data: todayActions = [] } = useTodayActions();
  
  const birthdayActions = todayActions.filter(action => action.type === "birthday").length;
  const evaluationActions = todayActions.filter(action => action.type === "evaluation").length;
  const followupActions = todayActions.filter(action => action.type === "followup").length;
  const totalActions = todayActions.length;

  const completionRate = 75; // Simulado
  const monthlyGoal = 100; // Meta de mensagens do mês
  const currentMessages = 67; // Mensagens enviadas este mês

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ações Pendentes Hoje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Aniversários</span>
            <span className="text-sm font-medium">{birthdayActions}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Avaliações</span>
            <span className="text-sm font-medium">{evaluationActions}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Follow-ups</span>
            <span className="text-sm font-medium">{followupActions}</span>
          </div>
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold text-primary">{totalActions}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Meta Mensal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Mensagens Enviadas</span>
            <span className="text-sm font-medium">{currentMessages}/{monthlyGoal}</span>
          </div>
          <Progress value={(currentMessages / monthlyGoal) * 100} className="h-2" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>Meta: {monthlyGoal} mensagens</span>
            <span>{Math.round((currentMessages / monthlyGoal) * 100)}% concluído</span>
          </div>
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Taxa de Sucesso</span>
              <span className="text-sm font-medium text-green-600">{completionRate}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
