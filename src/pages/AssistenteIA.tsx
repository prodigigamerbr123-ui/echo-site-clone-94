import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AIChat } from "@/components/ai-assistant/AIChat";
import { ConversationSidebar } from "@/components/ai-assistant/ConversationSidebar";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "aiActiveConversationId";

export default function AssistenteIA() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ready, setReady] = useState(false);

  // Restore last conversation on mount
  useEffect(() => {
    (async () => {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const { data } = await supabase
          .from("ai_conversations")
          .select("id")
          .eq("id", stored)
          .maybeSingle();
        if (data) {
          setActiveId(stored);
          setReady(true);
          return;
        }
      }
      // Fallback: most recent conversation
      const { data } = await supabase
        .from("ai_conversations")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setActiveId(data.id);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(LS_KEY, activeId);
  }, [activeId]);

  const handleNew = () => {
    localStorage.removeItem(LS_KEY);
    setActiveId(null);
  };

  const handleCreated = (id: string) => {
    setActiveId(id);
    setRefreshKey((k) => k + 1);
  };

  const handleChanged = () => {
    setRefreshKey((k) => k + 1);
  };

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

      <Card className="h-[calc(100vh-12rem)] overflow-hidden">
        <CardContent className="h-full p-0">
          <div className="h-full grid grid-cols-[260px_1fr]">
            <ConversationSidebar
              activeId={activeId}
              onSelect={setActiveId}
              onNew={handleNew}
              refreshKey={refreshKey}
            />
            <div className="h-full min-w-0 min-h-0 overflow-hidden">
              {ready && (
                <AIChat
                  key={activeId ?? "new"}
                  isExpanded={true}
                  conversationId={activeId}
                  onConversationCreated={handleCreated}
                  onConversationChanged={handleChanged}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
