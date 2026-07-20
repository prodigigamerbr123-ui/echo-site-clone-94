import { useState, useEffect, useMemo } from "react";
import { MessageSquare, Search, Plus, Edit, Trash2, Copy, Sparkles, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";

interface PredefinedMessage {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export default function MensagensPredefinidas() {
  const [messages, setMessages] = useState<PredefinedMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PredefinedMessage | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("predefined_messages")
        .select("*")
        .order("title");
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching predefined messages:", error);
      toast({ title: "Erro", description: "Não foi possível carregar as mensagens pré-definidas.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = useMemo(
    () =>
      messages.filter((m) => {
        const q = searchTerm.toLowerCase();
        return m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
      }),
    [messages, searchTerm]
  );

  const totalChars = useMemo(() => messages.reduce((acc, m) => acc + m.content.length, 0), [messages]);
  const withVars = useMemo(() => messages.filter((m) => /\{\w+\}/.test(m.content)).length, [messages]);

  const handleSaveMessage = async () => {
    if (!title.trim() || !content.trim()) {
      toast({ title: "Atenção", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingMessage) {
        const { error } = await supabase
          .from("predefined_messages")
          .update({ title: title.trim(), content: content.trim() })
          .eq("id", editingMessage.id);
        if (error) throw error;
        toast({ title: "Sucesso!", description: "Mensagem atualizada com sucesso." });
      } else {
        const { error } = await supabase
          .from("predefined_messages")
          .insert({ title: title.trim(), content: content.trim() });
        if (error) throw error;
        toast({ title: "Sucesso!", description: "Mensagem pré-definida criada com sucesso." });
      }
      setTitle("");
      setContent("");
      setEditingMessage(null);
      setIsDialogOpen(false);
      fetchMessages();
    } catch (error) {
      console.error("Error saving predefined message:", error);
      toast({ title: "Erro", description: "Não foi possível salvar a mensagem.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditMessage = (m: PredefinedMessage) => {
    setEditingMessage(m);
    setTitle(m.title);
    setContent(m.content);
    setIsDialogOpen(true);
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta mensagem pré-definida?")) return;
    try {
      const { error } = await supabase.from("predefined_messages").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Sucesso!", description: "Mensagem pré-definida excluída." });
      fetchMessages();
    } catch (error) {
      console.error("Error deleting predefined message:", error);
      toast({ title: "Erro", description: "Não foi possível excluir a mensagem.", variant: "destructive" });
    }
  };

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado!", description: "Mensagem copiada para a área de transferência." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar a mensagem.", variant: "destructive" });
    }
  };

  const openNewMessageDialog = () => {
    setEditingMessage(null);
    setTitle("");
    setContent("");
    setIsDialogOpen(true);
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const extractVars = (text: string) => {
    const found = new Set<string>();
    text.replace(/\{(\w+)\}/g, (_, k) => (found.add(k.toLowerCase()), ""));
    return Array.from(found);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando mensagens pré-definidas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-background p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20">
              <MessageSquare className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Mensagens Pré-definidas</h1>
              <p className="text-muted-foreground text-sm">
                Templates reutilizáveis para envios manuais e automações
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewMessageDialog} className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Nova Mensagem
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingMessage ? "Editar" : "Nova"} Mensagem Pré-definida</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Título da Mensagem</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Boas-vindas, Lembrete de treino..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{title.length}/100 caracteres</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="content">Conteúdo da Mensagem</Label>
                    <div className="flex gap-1">
                      {["nome", "dias", "data", "hora"].map((v) => (
                        <Button
                          key={v}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setContent(
                              (prev) => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + `{${v}}`
                            )
                          }
                        >
                          + {"{" + v + "}"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    id="content"
                    placeholder="Digite o conteúdo da mensagem..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-32"
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {content.length}/1000 • Variáveis: <code>{"{nome}"}</code>, <code>{"{dias}"}</code>,{" "}
                    <code>{"{data}"}</code>, <code>{"{hora}"}</code>
                  </p>
                </div>
                <WhatsAppPreview content={content} />
                <Button onClick={handleSaveMessage} disabled={saving} className="w-full">
                  {saving ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Salvando...
                    </div>
                  ) : editingMessage ? (
                    "Atualizar Mensagem"
                  ) : (
                    "Criar Mensagem"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-none">{messages.length}</div>
              <div className="text-xs text-muted-foreground mt-1">templates</div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-none">{withVars}</div>
              <div className="text-xs text-muted-foreground mt-1">com variáveis</div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold leading-none">{totalChars}</div>
              <div className="text-xs text-muted-foreground mt-1">caracteres</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por título ou conteúdo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* List */}
      {filteredMessages.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {searchTerm ? "Nenhuma mensagem encontrada." : "Nenhuma mensagem pré-definida ainda."}
            </p>
            {!searchTerm && (
              <Button onClick={openNewMessageDialog} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeira Mensagem
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMessages.map((message) => {
            const vars = extractVars(message.content);
            return (
              <Card
                key={message.id}
                className="group relative overflow-hidden border transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-primary/40" />
                <CardContent className="p-5 pl-6 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-base leading-snug line-clamp-2 flex-1">
                      {message.title}
                    </h3>
                    <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditMessage(message)}
                        className="h-9 w-9 p-0"
                        aria-label="Editar mensagem pré-definida"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMessage(message.id)}
                        className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label="Excluir mensagem pré-definida"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(message.created_at)}</span>
                    <span>•</span>
                    <span>{message.content.length} chars</span>
                  </div>

                  <div className="rounded-lg bg-muted/50 border border-border/50 p-3 mb-3 flex-1">
                    <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-5 leading-relaxed">
                      {message.content}
                    </p>
                  </div>

                  {vars.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {vars.map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs font-mono">
                          {"{" + v + "}"}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyMessage(message.content)}
                    className="w-full gap-2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar conteúdo
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
