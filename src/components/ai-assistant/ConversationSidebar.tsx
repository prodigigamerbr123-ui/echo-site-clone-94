import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Plus, MessageSquare, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

export function ConversationSidebar({ activeId, onSelect, onNew, refreshKey }: Props) {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      console.error(error);
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Excluir esta conversa?')) return;
    const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNew();
  };

  return (
    <div className="flex flex-col h-full border-r bg-muted/30">
      <div className="p-3 border-b">
        <Button onClick={onNew} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova conversa
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 px-2">
              Nenhuma conversa ainda. Clique em "Nova conversa" para começar.
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  'group flex items-start gap-2 rounded-md px-2 py-2 cursor-pointer text-sm hover:bg-accent transition-colors',
                  activeId === c.id && 'bg-accent'
                )}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label="Excluir"
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
