
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, UserPlus, Calendar, Clock } from "lucide-react";

const recentActivities = [
  {
    id: 1,
    type: "message",
    title: "Mensagem enviada para Maria Silva",
    description: "Lembrete de avaliação física",
    time: "2 min atrás",
    icon: MessageCircle,
    color: "bg-blue-100 text-blue-600"
  },
  {
    id: 2,
    type: "student",
    title: "Novo aluno cadastrado",
    description: "João Santos se cadastrou na academia",
    time: "15 min atrás",
    icon: UserPlus,
    color: "bg-green-100 text-green-600"
  },
  {
    id: 3,
    type: "birthday",
    title: "Aniversário enviado",
    description: "Parabéns enviado para Ana Costa",
    time: "1 hora atrás",
    icon: Calendar,
    color: "bg-purple-100 text-purple-600"
  },
  {
    id: 4,
    type: "scheduled",
    title: "Mensagem agendada",
    description: "Follow-up de 21 dias para Carlos Lima",
    time: "2 horas atrás",
    icon: Clock,
    color: "bg-orange-100 text-orange-600"
  },
  {
    id: 5,
    type: "message",
    title: "Mensagem enviada para Pedro Oliveira",
    description: "Motivação para treino",
    time: "3 horas atrás",
    icon: MessageCircle,
    color: "bg-blue-100 text-blue-600"
  }
];

export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade Recente</CardTitle>
        <CardDescription>
          Últimas ações realizadas no sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="flex items-center space-x-4">
              <div className={`p-2 rounded-full ${activity.color}`}>
                <activity.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {activity.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activity.description}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {activity.time}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
