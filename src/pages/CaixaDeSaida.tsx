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
        <TabsList>
          <TabsTrigger value="agendadas">Agendadas</TabsTrigger>
          <TabsTrigger value="enviadas">Enviadas</TabsTrigger>
          <TabsTrigger value="falhas">Falhas</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
