
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIChat } from "@/components/ai-assistant/AIChat";
import { Bot } from "lucide-react";

export default function AssistenteIA() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 bg-primary/20 rounded-full">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Assistente IA</h1>
          <p className="text-muted-foreground">
            Seu assistente inteligente para gestão da academia
          </p>
        </div>
      </div>

      <Card className="h-[calc(100vh-12rem)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Chat com Assistente
          </CardTitle>
        </CardHeader>
        <CardContent className="h-full p-0">
          <div className="h-full">
            <AIChat isExpanded={true} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
