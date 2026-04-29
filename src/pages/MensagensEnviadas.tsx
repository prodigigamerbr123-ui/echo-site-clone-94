
import MensagensEnviadasTab from "@/components/mensagens/MensagensEnviadasTab";

export default function MensagensEnviadas() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mensagens Enviadas</h1>
          <p className="text-muted-foreground">
            Histórico de todas as mensagens enviadas via WhatsApp
          </p>
        </div>
      </div>

      <MensagensEnviadasTab />
    </div>
  );
}
