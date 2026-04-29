
import { Button } from "@/components/ui/button";
import { Users, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

export function DashboardHeader() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do sistema de mensagens da Academia Workout
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/cadastrar-aluno">
            <Users className="h-4 w-4 mr-2" />
            Cadastrar Aluno
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/enviar-mensagem">
            <MessageCircle className="h-4 w-4 mr-2" />
            Enviar Mensagem
          </Link>
        </Button>
      </div>
    </div>
  );
}
