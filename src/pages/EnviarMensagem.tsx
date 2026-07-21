import { usePageTitle } from "@/hooks/usePageTitle";
import { useState, useEffect, useMemo } from "react";
import { Search, Send, Users, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WhatsAppPreview } from "@/components/whatsapp/WhatsAppPreview";
import { hasNameVar, replaceNameVar } from "@/lib/phone";
import { fetchAutomationTemplateIds } from "@/lib/automationTemplateIds";

interface Student { id: string; name: string; phone: string; had_evaluation: boolean; }
interface PredefinedMessage { id: string; title: string; content: string; }

export default function EnviarMensagem() {
  usePageTitle("Enviar Mensagem");
  const [students, setStudents] = useState<Student[]>([]);
  const [predefinedMessages, setPredefinedMessages] = useState<PredefinedMessage[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPredefined, setSelectedPredefined] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      await Promise.all([fetchStudents(), fetchPredefinedMessages()]);
      setLoading(false);
    })();
  }, []);

  const fetchStudents = async () => {
    const { data } = await supabase.from('students').select('id, name, phone, had_evaluation').order('name').limit(5000);
    setStudents(data || []);
  };
  const fetchPredefinedMessages = async () => {
    const [{ data }, autoIds] = await Promise.all([
      supabase.from('predefined_messages').select('*').order('title'),
      fetchAutomationTemplateIds(),
    ]);
    setPredefinedMessages((data || []).filter((m: any) => !autoIds.has(m.id)));
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)
  );

  const handleStudentToggle = (id: string) => {
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const handleSelectAll = () => {
    setSelectedStudents(selectedStudents.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));
  };
  const handlePredefinedSelect = (id: string) => {
    const m = predefinedMessages.find(x => x.id === id);
    if (m) { setMessage(m.content); setSelectedPredefined(id); }
  };
  const insertNameVar = () => {
    setMessage((prev) => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + "{nome}");
  };

  const spreadInfo = useMemo(() => {
    const n = selectedStudents.length;
    if (n <= 5) return { spread: false, minutes: 0 };
    if (n <= 20) return { spread: true, minutes: Math.min(30, n * 2) };
    if (n <= 100) return { spread: true, minutes: 60 };
    return { spread: true, minutes: Math.ceil(n * 0.6) }; // ~36 msgs/min
  }, [selectedStudents.length]);

  const enqueue = async () => {
    if (sending) return;
    if (!message.trim()) {
      toast({ title: "Digite uma mensagem", variant: "destructive" });
      setConfirmOpen(false);
      return;
    }
    if (selectedStudents.length === 0) {
      toast({ title: "Selecione pelo menos um aluno", variant: "destructive" });
      setConfirmOpen(false);
      return;
    }
    setSending(true);
    try {
      const selected = students.filter(s => selectedStudents.includes(s.id));
      const now = Date.now();
      const spanMs = spreadInfo.spread ? spreadInfo.minutes * 60 * 1000 : 0;
      const rows = selected.map((s, i) => {
        // baseline: 1-3 min de "arranque" e depois espalhamento
        const startOffset = 60 * 1000 + Math.floor(Math.random() * 2 * 60 * 1000);
        const spreadOffset = selected.length > 1 && spanMs > 0
          ? Math.floor((spanMs / (selected.length - 1)) * i) + Math.floor(Math.random() * 20000)
          : 0;
        return {
          student_id: s.id,
          content: replaceNameVar(message.trim(), s.name),
          scheduled_for: new Date(now + startOffset + spreadOffset).toISOString(),
          message_type: "manual",
          status: "pending",
        };
      });
      const { error } = await supabase.from('scheduled_messages').insert(rows);
      if (error) throw error;

      toast({
        title: `${rows.length} mensagem(ns) na fila`,
        description: spreadInfo.spread
          ? `Serão enviadas de forma gradual ao longo de ~${spreadInfo.minutes} min.`
          : "Serão enviadas nos próximos minutos.",
      });
      setMessage("");
      setSelectedStudents([]);
      setSelectedPredefined("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const handleSend = () => {
    if (!message.trim()) {
      toast({ title: "Digite uma mensagem", variant: "destructive" });
      return;
    }
    if (selectedStudents.length === 0) {
      toast({ title: "Selecione pelo menos um aluno", variant: "destructive" });
      return;
    }
    if (selectedStudents.length > 100) {
      setConfirmOpen(true);
      return;
    }
    enqueue();
  };

  const previewName = useMemo(() => {
    if (selectedStudents.length === 1) {
      return students.find(s => s.id === selectedStudents[0])?.name;
    }
    return undefined;
  }, [selectedStudents, students]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Send className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Enviar Mensagem</h1>
          <p className="text-muted-foreground">Aqui você pode enviar mensagens diretas para os alunos</p>
        </div>

      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Selecionar Alunos ({selectedStudents.length})
            </CardTitle>
            <div className="flex gap-2 pt-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Button variant="outline" onClick={handleSelectAll} className="shrink-0">
                {selectedStudents.length === filteredStudents.length ? "Desmarcar" : "Todos"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {filteredStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum aluno.</p>
            ) : (
              filteredStudents.map(s => (
                <div
                  key={s.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer ${
                    selectedStudents.includes(s.id) ? 'bg-accent/50 border-primary/50' : 'border-border'
                  }`}
                  onClick={() => handleStudentToggle(s.id)}
                >
                  <Checkbox checked={selectedStudents.includes(s.id)} className="pointer-events-none" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.phone}</p>
                  </div>
                  {s.had_evaluation && <Badge variant="secondary" className="text-xs">Avaliado</Badge>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Nova Mensagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="em-predefined" className="text-sm font-medium mb-2 block">Pré-definidas</Label>
              <Select value={selectedPredefined} onValueChange={handlePredefinedSelect}>
                <SelectTrigger id="em-predefined"><SelectValue placeholder="Escolha uma mensagem" /></SelectTrigger>
                <SelectContent>
                  {predefinedMessages.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="em-message" className="text-sm font-medium">Conteúdo</Label>
                <Button type="button" variant="ghost" size="sm" onClick={insertNameVar} aria-label="Inserir variável nome">
                  + Inserir {"{nome}"}
                </Button>
              </div>
              <Textarea
                id="em-message"
                placeholder="Digite a mensagem..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="min-h-32"
                maxLength={1000}
              />
              <p className="text-xs text-foreground/80 mt-1">
                {message.length}/1000 • Use <code>{"{nome}"}</code> para personalizar automaticamente
              </p>
            </div>

            <WhatsAppPreview content={message} studentName={previewName} />

            {spreadInfo.spread && (
              <p className="text-xs text-muted-foreground">
                ⏱ {selectedStudents.length} alunos → distribuído ao longo de ~{spreadInfo.minutes} minutos
                {hasNameVar(message) && " • {nome} substituído por aluno"}
              </p>
            )}

            <Button
              onClick={handleSend}
              disabled={sending || !message.trim() || selectedStudents.length === 0}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enfileirando..." : `Enfileirar envio (${selectedStudents.length})`}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a enviar para <strong>{selectedStudents.length} alunos</strong>.
              As mensagens serão distribuídas ao longo de <strong>~{spreadInfo.minutes} minutos</strong>{" "}
              (~{Math.ceil(spreadInfo.minutes / 60)}h) para não ser bloqueado pelo WhatsApp.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={enqueue} disabled={sending}>
              {sending ? "Enviando..." : `Enviar para ${selectedStudents.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
