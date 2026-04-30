import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, MessageSquare, Clock, Send, Calendar } from "lucide-react";
import { Link } from "react-router-dom";

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso Rápido</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Button asChild size="sm" className="h-auto flex-col gap-2 p-4">
            <Link to="/alunos">
              <UserPlus className="h-5 w-5" />
              <span className="text-xs">Cadastrar Aluno</span>
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-auto flex-col gap-2 p-4">
            <Link to="/alunos?tab=lista">
              <Users className="h-5 w-5" />
              <span className="text-xs">Ver Alunos</span>
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-auto flex-col gap-2 p-4">
            <Link to="/enviar-mensagem">
              <Send className="h-5 w-5" />
              <span className="text-xs">Enviar Mensagem</span>
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-auto flex-col gap-2 p-4">
            <Link to="/agendar-mensagem">
              <Clock className="h-5 w-5" />
              <span className="text-xs">Agendar Mensagem</span>
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-auto flex-col gap-2 p-4">
            <Link to="/mensagens-predefinidas">
              <MessageSquare className="h-5 w-5" />
              <span className="text-xs">Pré-definidas</span>
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-auto flex-col gap-2 p-4">
            <Link to="/mensagens-enviadas">
              <Calendar className="h-5 w-5" />
              <span className="text-xs">Histórico</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
