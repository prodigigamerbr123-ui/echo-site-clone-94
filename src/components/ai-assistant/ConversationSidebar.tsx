import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { errorMessage } from "@/lib/errorMessage";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface AIConversation {
  id: string;
  title: string;
  updated_at: string;
}
interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey?: number;
  disabled?: boolean;
  onMutating?: (busy: boolean) => void;
  onDeleted?: (id: string) => void;
}
export function ConversationSidebar({
  activeId,
  onSelect,
  onNew,
  refreshKey,
  disabled,
  onMutating,
  onDeleted,
}: Props) {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["ai-conversations", user?.id],
    enabled: !!user,
    queryFn: () =>
      fetchAllPages((from, to) =>
        supabase
          .from("ai_conversations")
          .select("id,title,updated_at", { count: "exact" })
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
  });
  const previousRefresh = useRef(refreshKey);
  const { refetch } = query;
  useEffect(() => {
    if (previousRefresh.current !== refreshKey) {
      previousRefresh.current = refreshKey;
      void refetch();
    }
  }, [refreshKey, refetch]);
  const handleDelete = async (id: string) => {
    if (disabled || deleting || !confirm("Excluir esta conversa?")) return;
    setDeleting(id);
    onMutating?.(true);
    try {
      const { data, error } = await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Conversa indisponível. Atualize a lista.");
      onDeleted?.(id);
      await refetch();
    } catch (e) {
      toast({
        title: "Não foi possível excluir",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
      onMutating?.(false);
    }
  };
  const locked = disabled || deleting !== null;
  return (
    <div className="flex flex-col h-full border-r bg-muted/30">
      <div className="p-3 border-b">
        <Button onClick={onNew} disabled={locked} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova conversa
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {query.isPending ? (
            <div
              role="status"
              className="flex items-center justify-center py-6"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : query.isError ? (
            <div role="alert" className="p-2 space-y-2 text-xs">
              <p>Não foi possível carregar as conversas.</p>
              <Button
                size="sm"
                variant="outline"
                disabled={locked || query.isFetching}
                onClick={() => void refetch()}
              >
                Atualizar lista
              </Button>
            </div>
          ) : query.data?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 px-2">
              Nenhuma conversa ainda. Comece uma nova.
            </p>
          ) : (
            query.data?.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-start gap-2 rounded-md p-2 text-sm hover:bg-accent",
                  activeId === c.id && "bg-accent",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  disabled={locked}
                  aria-current={activeId === c.id ? "page" : undefined}
                  className="flex flex-1 gap-2 text-left min-w-0 disabled:opacity-60"
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">
                      {c.title}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updated_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(c.id)}
                  disabled={locked}
                  aria-label={`Excluir conversa ${c.title}`}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
