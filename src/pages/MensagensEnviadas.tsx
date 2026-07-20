import { usePageTitle } from "@/hooks/usePageTitle";
import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";
import { History } from "lucide-react";

export default function MensagensEnviadas() {
  usePageTitle("Histórico de Mensagens");
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-primary">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Mensagens</h1>
          <p className="text-muted-foreground text-sm">
            Histórico completo de mensagens enviadas via WhatsApp
          </p>
        </div>
      </div>

      <MensagensEnviadasTab />
    </div>
  );
}
