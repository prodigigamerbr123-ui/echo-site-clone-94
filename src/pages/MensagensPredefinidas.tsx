import { useState, useEffect } from "react";
import { MessageSquare, Search, Plus, Edit, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  
  // Form states
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
        .from('predefined_messages')
        .select('*')
        .order('title');

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching predefined messages:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens pré-definidas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = messages.filter((message) => {
    const matchesSearch = 
      message.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const handleSaveMessage = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Atenção",
        description: "Preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      if (editingMessage) {
        // Update existing message
        const { error } = await supabase
          .from('predefined_messages')
          .update({
            title: title.trim(),
            content: content.trim(),
          })
          .eq('id', editingMessage.id);

        if (error) throw error;

        toast({
          title: "Sucesso!",
          description: "Mensagem atualizada com sucesso.",
        });
      } else {
        // Create new message
        const { error } = await supabase
          .from('predefined_messages')
          .insert({
            title: title.trim(),
            content: content.trim(),
          });

        if (error) throw error;

        toast({
          title: "Sucesso!",
          description: "Mensagem pré-definida criada com sucesso.",
        });
      }

      // Reset form
      setTitle("");
      setContent("");
      setEditingMessage(null);
      setIsDialogOpen(false);
      
      // Refresh list
      fetchMessages();
    } catch (error) {
      console.error('Error saving predefined message:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a mensagem.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditMessage = (message: PredefinedMessage) => {
    setEditingMessage(message);
    setTitle(message.title);
    setContent(message.content);
    setIsDialogOpen(true);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta mensagem pré-definida?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('predefined_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Mensagem pré-definida excluída.",
      });
      
      fetchMessages();
    } catch (error) {
      console.error('Error deleting predefined message:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a mensagem.",
        variant: "destructive",
      });
    }
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copiado!",
        description: "Mensagem copiada para a área de transferência.",
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: "Erro",
        description: "Não foi possível copiar a mensagem.",
        variant: "destructive",
      });
    }
  };

  const openNewMessageDialog = () => {
    setEditingMessage(null);
    setTitle("");
    setContent("");
    setIsDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mensagens Pré-definidas</h1>
            <p className="text-muted-foreground">
              Crie e gerencie templates de mensagens para uso rápido
            </p>
          </div>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewMessageDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Mensagem
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingMessage ? 'Editar' : 'Nova'} Mensagem Pré-definida
              </DialogTitle>
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
                <p className="text-xs text-muted-foreground mt-1">
                  {title.length}/100 caracteres
                </p>
              </div>
              
              <div>
                <Label htmlFor="content">Conteúdo da Mensagem</Label>
                <Textarea
                  id="content"
                  placeholder="Digite o conteúdo da mensagem..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-32"
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {content.length}/1000 caracteres
                </p>
              </div>
              
              <Button 
                onClick={handleSaveMessage}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Salvando...
                  </div>
                ) : (
                  editingMessage ? 'Atualizar Mensagem' : 'Criar Mensagem'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título ou conteúdo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Messages List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMessages.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <CardContent className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  {searchTerm 
                    ? "Nenhuma mensagem encontrada com os filtros aplicados." 
                    : "Nenhuma mensagem pré-definida ainda."}
                </p>
                {!searchTerm && (
                  <Button onClick={openNewMessageDialog} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Criar Primeira Mensagem
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          filteredMessages.map((message) => (
            <Card key={message.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-medium line-clamp-1">
                    {message.title}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyMessage(message.content)}
                      className="h-8 w-8 p-0"
                      title="Copiar mensagem"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditMessage(message)}
                      className="h-8 w-8 p-0"
                      title="Editar mensagem"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMessage(message.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      title="Excluir mensagem"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Criada em {formatDate(message.created_at)}
                </p>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-sm text-foreground line-clamp-4">
                    {message.content}
                  </p>
                </div>
                
                <div className="flex justify-between items-center mt-4">
                  <span className="text-xs text-muted-foreground">
                    {message.content.length} caracteres
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyMessage(message.content)}
                    className="gap-2"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}