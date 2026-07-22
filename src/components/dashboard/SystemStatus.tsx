
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Database, MessageSquare } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardData";

export function SystemStatus() {
  const { data: stats, isLoading, error } = useDashboardStats();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status do Sistema</CardTitle>
        <CardDescription>Estado atual da aplicação</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-green-500" />
            <span className="text-sm">Banco de dados</span>
          </div>
          <Badge variant={error ? "destructive" : "outline"} className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            {error ? "Erro" : "Conectado"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <span className="text-sm">Sistema de mensagens</span>
          </div>
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        </div>
        
        {!isLoading && stats && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Última atualização: {new Date().toLocaleTimeString('pt-BR')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
