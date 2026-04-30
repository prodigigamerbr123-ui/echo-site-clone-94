import { MessageCircle } from "lucide-react";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";

export default function WhatsApp() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-lg">
          <MessageCircle className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">WhatsApp</h1>
          <p className="text-muted-foreground">
            Conecte o WhatsApp da academia para enviar mensagens automaticamente
          </p>
        </div>
      </div>

      <div className="max-w-xl">
        <WhatsAppStatus />
      </div>
    </div>
  );
}
