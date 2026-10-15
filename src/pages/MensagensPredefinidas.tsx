import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { errorMessage } from "@/lib/errorMessage";
import { MessageSquare, Search, Plus, Edit, Trash2, Copy, Sparkles, FileText, Calendar, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import { loadPredefinedMessages, savePredefinedMessage, deletePredefinedMessage, type PredefinedMessage } from "@/lib/predefinedMessages";
import { useAuth } from "@/hooks/useAuth";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";

export default function MensagensPredefinidas() {
  usePageTitle("Mensagens Pré-definidas");
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["predefined-messages", "catalog"], queryFn: loadPredefinedMessages });
  const messages = useMemo(() => catalog.data?.messages ?? [], [catalog.data]);
  const automationIds = useMemo(() => catalog.data?.automationIds ?? new Set<string>(), [catalog.data]);
  const canManageTemplates = import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PredefinedMessage | null>(null);
  const [activeTab, setActiveTab] = useState<"manual" | "automation">("manual");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const busy = useRef(false);
  const createId = useRef<string | null>(null);

  const { toast } = useToast();

  const manualMessages = useMemo(() => messages.filter((m) => !automationIds.has(m.id)), [messages, automationIds]);
  const automationMessages = useMemo(() => messages.filter((m) => automationIds.has(m.id)), [messages, automationIds]);

  const currentList = activeTab === "manual" ? manualMessages : automationMessages;

  const filteredMessages = useMemo(
    () =>
      currentList.filter((m) => {
        const q = searchTerm.toLowerCase();
        return m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
      }),
    [currentList, searchTerm]
  );

  const withVars = useMemo(() => currentList.filter((m) => /\{\w+\}/.test(m.content)).length, [currentList]);

  const handleSaveMessage = async () => {
    if (!canManageTemplates) return;
    if (!title.trim() || !content.trim()) {
      toast({ title: "Atenção", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const id = editingMessage?.id ?? (createId.current ??= crypto.randomUUID());
      await savePredefinedMessage(id, { title, content }, !!editingMessage);
      toast({ title: "Sucesso!", description: editingMessage ? "Mensagem atualizada com sucesso." : "Mensagem pré-definida criada com sucesso." });
      setTitle("");
      setContent("");
      setEditingMessage(null);
      setIsDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["predefined-messages"] }),
        queryClient.invalidateQueries({ queryKey: ["message-composer-data"] }),
      ]);
    } catch (error) {
      setSaveError("Não foi possível confirmar o salvamento. " + errorMessage(error));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const handleEditMessage = (m: PredefinedMessage) => {
    if (!canManageTemplates || busy.current) return;
    setSaveError(null);
    setEditingMessage(m);
    setTitle(m.title);
    setContent(m.content);
    setIsDialogOpen(true);
  };

  const handleDeleteMessage = async (id: string) => {
    if (!canManageTemplates || busy.current) return;
    const confirmation = automationIds.has(id)
      ? "Esta mensagem está vinculada a uma automação. Ao excluir, ela passará a usar o texto padrão. Deseja excluir?"
      : "Tem certeza que deseja excluir esta mensagem pré-definida?";
    if (!confirm(confirmation)) return;
    busy.current = true;
    setSaving(true);
    try {
      await deletePredefinedMessage(id);
      toast({ title: "Sucesso!", description: "Mensagem pré-definida excluída." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["predefined-messages"] }),
        queryClient.invalidateQueries({ queryKey: ["message-composer-data"] }),
      ]);
    } catch (error) {
      toast({ title: "Erro", description: errorMessage(error), variant: "destructive" });
    } finally {
      busy.current = false;
      setSaving(false);
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
    if (!canManageTemplates || busy.current) return;
    createId.current = crypto.randomUUID();
    setSaveError(null);
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

  if (catalog.error) {
    return <div role="alert" className="space-y-3">
      <h1 className="text-2xl font-bold">Mensagens Pré-definidas</h1>
      <p>Não foi possível carregar as mensagens e seus vínculos com automações.</p>
      <Button onClick={() => void catalog.refetch()}>Tentar novamente</Button>
    </div>;
  }

  if (catalog.isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p role="status" className="text-muted-foreground">Carregando mensagens pré-definidas...</p>
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
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!busy.current) setIsDialogOpen(open); }}>
            {canManageTemplates && <DialogTrigger asChild>
              <Button disabled={saving} onClick={openNewMessageDialog} className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Nova Mensagem
              </Button>
            </DialogTrigger>}
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingMessage ? "Editar" : "Nova"} Mensagem Pré-definida</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Título da Mensagem</Label>
                  <Input
                    id="title"
                    disabled={saving}
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
                          disabled={saving}
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
                    disabled={saving}
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
                {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
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

      </div>


      {/* Tabs + Search */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "automation")}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <TabsList>
            <TabsTrigger value="manual" className="gap-2">
              <FileText className="h-4 w-4" />
              Manuais
              <Badge variant="secondary" className="ml-1">{manualMessages.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="automation" className="gap-2">
              <Zap className="h-4 w-4" />
              Automação
              <Badge variant="secondary" className="ml-1">{automationMessages.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>{withVars} com variáveis</span>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar mensagens"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
          </div>
        </div>

        {activeTab === "automation" && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Mensagens vinculadas a automações.</span> Elas não aparecem nas opções de envio manual — são usadas apenas pelos disparos automáticos configurados em <span className="font-medium">Automações</span>.
          </div>
        )}

        <TabsContent value={activeTab} className="mt-4">


      {/* List */}
      {filteredMessages.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {searchTerm ? "Nenhuma mensagem encontrada." : "Nenhuma mensagem pré-definida ainda."}
            </p>
            {!searchTerm && canManageTemplates && (
              <Button disabled={saving} onClick={openNewMessageDialog} variant="outline" className="gap-2">
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
                    {canManageTemplates && <div className="flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving}
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
                        disabled={saving}
                        onClick={() => handleDeleteMessage(message.id)}
                        className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label="Excluir mensagem pré-definida"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
