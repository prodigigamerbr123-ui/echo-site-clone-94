import { usePageTitle } from "@/hooks/usePageTitle";
import { CalendarClock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ScheduledList from "@/components/mensagens/ScheduledList";
import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";

export default function CaixaDeSaida() {
  usePageTitle("Caixa de saída");
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

      <Tabs defaultValue="agendadas" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="agendadas">Agendadas</TabsTrigger>
          <TabsTrigger value="enviadas">Enviadas</TabsTrigger>
          <TabsTrigger value="falhas">Falhas</TabsTrigger>
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
        <TabsContent value="canceladas" className="mt-4">
          <ScheduledList statusFilter="cancelled" emptyLabel="Nenhuma mensagem cancelada." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
