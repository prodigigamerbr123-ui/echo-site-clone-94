import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AIChat } from "@/components/ai-assistant/AIChat";
import { ConversationSidebar } from "@/components/ai-assistant/ConversationSidebar";
import { Bot, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { chatUuid } from "../../supabase/functions/_shared/aiChatContracts";

export default function AssistenteIA() {
  usePageTitle("Assistente IA");
  const { user } = useAuth();
  const storageKey = `aiActiveConversationId:${user?.id ?? "none"}`;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [restoreKey, setRestoreKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [sidebarBusy, setSidebarBusy] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const busy = chatBusy || sidebarBusy;
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setRestoreError(false);
    void (async () => {
      try {
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(storageKey);
        } catch {
          /* Storage may be unavailable. */
        }
        let id: string | null = null;
        if (chatUuid(stored)) {
          const found = await supabase
            .from("ai_conversations")
            .select("id")
            .eq("id", stored)
            .maybeSingle();
          if (found.error) throw found.error;
          id = found.data?.id ?? null;
        }
        if (!id) {
          const latest = await supabase
            .from("ai_conversations")
            .select("id")
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latest.error) throw latest.error;
          id = latest.data?.id ?? null;
        }
        if (!cancelled) {
          setActiveId(id);
          setReady(true);
        }
      } catch {
        if (!cancelled) setRestoreError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, restoreKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (activeId) localStorage.setItem(storageKey, activeId);
      else localStorage.removeItem(storageKey);
    } catch {
      /* Storage may be unavailable. */
    }
  }, [activeId, storageKey, ready]);
  const handleSelect = (id: string | null) => {
    if (busy) return;
    setActiveId(id);
    setSessionKey((k) => k + 1);
    setMobileOpen(false);
  };
  const handleCreated = (id: string) => {
    setActiveId(id);
    setRefreshKey((k) => k + 1);
  };
  const sidebar = (
    <ConversationSidebar
      activeId={activeId}
      onSelect={(id) => handleSelect(id)}
      onNew={() => handleSelect(null)}
      refreshKey={refreshKey}
      disabled={busy}
      onMutating={setSidebarBusy}
      onDeleted={(id) => {
        if (activeId === id) {
          setActiveId(null);
          setSessionKey((k) => k + 1);
          setMobileOpen(false);
        }
      }}
    />
  );
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 bg-primary/20 rounded-full">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Assistente IA</h1>
          <p className="text-muted-foreground">
            Seu assistente para gestão da academia
          </p>
        </div>
      </div>
      {restoreError ? (
        <Card role="alert">
          <CardContent className="p-5 space-y-3">
            <p>Não foi possível carregar suas conversas.</p>
            <Button
              variant="outline"
              onClick={() => setRestoreKey((k) => k + 1)}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : !ready ? (
        <div role="status" className="flex gap-2 p-5">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando conversas...
        </div>
      ) : (
        <Card className="h-[calc(100dvh-12rem)] min-h-[360px] overflow-hidden">
          <CardContent className="h-full p-0 flex flex-col">
            <div className="md:hidden border-b p-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMobileOpen(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Conversas
              </Button>
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr]">
              <div className="hidden md:block min-h-0">{sidebar}</div>
              <div className="h-full min-w-0 min-h-0 overflow-hidden">
                <AIChat
                  key={`${user?.id}:${sessionKey}`}
                  isExpanded
                  conversationId={activeId}
                  onConversationCreated={handleCreated}
                  onConversationChanged={() => setRefreshKey((k) => k + 1)}
                  onBusyChange={setChatBusy}
                  disabled={sidebarBusy}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[min(320px,90vw)] p-0 flex flex-col"
        >
          <SheetHeader className="p-4">
            <SheetTitle>Conversas do assistente</SheetTitle>
            <SheetDescription>
              Selecione uma conversa ou comece uma nova.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0">{sidebar}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
