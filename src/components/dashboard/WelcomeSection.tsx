
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, UserPlus, MessageSquare, Clock, Send, Calendar } from "lucide-react";
import { Link } from "react-router-dom";

export function WelcomeSection() {
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {greeting}! 👋
            </h1>
            <p className="text-muted-foreground mb-6">
              Aqui estão os atalhos rápidos para gerenciar sua academia.
            </p>
            
            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button asChild size="sm" className="h-full min-h-20 min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal">
                <Link to="/alunos">
                  <UserPlus className="h-5 w-5 shrink-0" />
                  <span className="block max-w-full overflow-hidden break-words text-center text-xs leading-tight">Cadastrar Aluno</span>
                </Link>
              </Button>
              
              <Button asChild size="sm" variant="outline" className="h-full min-h-20 min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal">
                <Link to="/alunos?tab=lista">
                  <Users className="h-5 w-5 shrink-0" />
                  <span className="block max-w-full overflow-hidden break-words text-center text-xs leading-tight">Ver Alunos</span>
                </Link>
              </Button>
              
              <Button asChild size="sm" variant="outline" className="h-full min-h-20 min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal">
                <Link to="/mensagens">
                  <Send className="h-5 w-5 shrink-0" />
                  <span className="block max-w-full overflow-hidden break-words text-center text-xs leading-tight">Enviar Mensagem</span>
                </Link>
              </Button>
              
              <Button asChild size="sm" variant="outline" className="h-full min-h-20 min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal">
                <Link to="/mensagens?tab=agendar">
                  <Clock className="h-5 w-5 shrink-0" />
                  <span className="block max-w-full overflow-hidden break-words text-center text-xs leading-tight">Agendar Mensagem</span>
                </Link>
              </Button>
              
              <Button asChild size="sm" variant="outline" className="h-full min-h-20 min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal">
                <Link to="/mensagens-predefinidas">
                  <MessageSquare className="h-5 w-5 shrink-0" />
                  <span className="block max-w-full overflow-hidden break-words text-center text-xs leading-tight">Mensagens Pré-definidas</span>
                </Link>
              </Button>
              
              <Button asChild size="sm" variant="outline" className="h-full min-h-20 min-w-0 flex-col gap-2 px-2 py-3 whitespace-normal">
                <Link to="/caixa-de-saida">
                  <Calendar className="h-5 w-5 shrink-0" />
                  <span className="block max-w-full overflow-hidden break-words text-center text-xs leading-tight">Histórico de Mensagens</span>
                </Link>
              </Button>
            </div>
          </div>
          
          <div className="hidden lg:block">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
              <TrendingUp className="h-12 w-12 text-primary" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
