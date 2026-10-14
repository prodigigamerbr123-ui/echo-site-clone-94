import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { PredefinedMsg } from "@/lib/automationCatalog";

export function CreatePredefinedDialog({
  open, suggestedTitle, onClose, onCreated,
}: {
  open: boolean;
  suggestedTitle: string;
  onClose: () => void;
  onCreated: (msg: PredefinedMsg) => void;
}) {
  const [title, setTitle] = useState(suggestedTitle);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTitle(suggestedTitle); setContent(""); }, [suggestedTitle]);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Preencha título e conteúdo");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("predefined_messages")
      .insert({ title: title.trim(), content: content.trim() })
      .select("id, title, content")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao criar");
      return;
    }
    toast.success("Mensagem criada");
    onCreated(data as PredefinedMsg);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova mensagem pré-definida</DialogTitle>
          <DialogDescription>
            Placeholders disponíveis: <code>{"{nome}"}</code>, <code>{"{data}"}</code>, <code>{"{hora}"}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pm-title">Título</Label>
            <Input id="pm-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm-content">Conteúdo</Label>
            <Textarea
              id="pm-content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ex.: Oi {nome}! Sua avaliação está confirmada para {data} às {hora}."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Criar e vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
