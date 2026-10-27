import { usePageTitle } from "@/hooks/usePageTitle";
import { CalendarClock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ScheduledList from "@/components/mensagens/ScheduledList";
import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";
import { useSearchParams } from "react-router-dom";

const tabs = ["agendadas", "enviadas", "falhas", "processando", "canceladas", "incertas"];

export default function CaixaDeSaida() {
  usePageTitle("Caixa de saída");
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = tabs.find(tab => tab === searchParams.get("aba")) || "agendadas";
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <CalendarClock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Caixa de saída</h1>
          <p className="text-muted-foreground">Mensagens agendadas, enviadas e falhas em um só lugar</p>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={tab => { const next = new URLSearchParams(searchParams); next.set("aba", tab); setSearchParams(next); }} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="agendadas">Agendadas</TabsTrigger>
          <TabsTrigger value="enviadas">Enviadas</TabsTrigger>
          <TabsTrigger value="falhas">Falhas</TabsTrigger>
          <TabsTrigger value="incertas">Conferir entrega</TabsTrigger>
          <TabsTrigger value="processando">Em envio</TabsTrigger>
          <TabsTrigger value="canceladas">Canceladas</TabsTrigger>
        </TabsList>
        <TabsContent value="agendadas" className="mt-4">
          <ScheduledList statusFilter="pending" emptyLabel="Nenhuma mensagem agendada." />
        </TabsContent>
        <TabsContent value="enviadas" className="mt-4">
          <MensagensEnviadasTab />
        </TabsContent>
        <TabsContent value="falhas" className="mt-4">
          <ScheduledList statusFilter="failed" emptyLabel="Nenhuma mensagem com falha." />
        </TabsContent>
        <TabsContent value="processando" className="mt-4">
          <ScheduledList statusFilter="processing" emptyLabel="Nenhuma mensagem em envio." />
        </TabsContent>
        <TabsContent value="incertas" className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-500/50 p-4 space-y-2 text-sm"><h2 className="font-semibold">Envios que precisam de conferência no WhatsApp</h2><p>O envio começou, mas o sistema não conseguiu confirmar o resultado. A mensagem pode ter chegado. Confira o destinatário, texto e horário no WhatsApp antes de decidir se precisa preparar outra mensagem.</p><p>Estes registros são preservados para consulta. A conferência aqui não marca uma mensagem como entregue e não dispara reenvio.</p></div>
          <ScheduledList statusFilter="uncertain" emptyLabel="Nenhuma entrega incerta para conferir nesta consulta." />
        </TabsContent>
        <TabsContent value="canceladas" className="mt-4">
          <ScheduledList statusFilter="cancelled" emptyLabel="Nenhuma mensagem cancelada." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
