import { usePageTitle } from "@/hooks/usePageTitle";
import { CalendarPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendarMensagemForm } from "@/components/mensagens/AgendarMensagemForm";
import { useNavigate } from "react-router-dom";

export default function AgendarMensagem() {
  usePageTitle("Agendar Mensagem");
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <CalendarPlus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Nova mensagem agendada</h1>
          <p className="text-muted-foreground">Rápido (presets) ou personalizado com recorrência.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agendar mensagem</CardTitle>
        </CardHeader>
        <CardContent>
          <AgendarMensagemForm onSaved={() => navigate("/caixa-de-saida")} />
        </CardContent>
      </Card>
    </div>
  );
}
