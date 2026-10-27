import { errorMessage } from "@/lib/errorMessage";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirm } from "@/components/ui/confirm-dialog-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isValidCpf, maskCpf, unmaskCpf } from "@/lib/cpf";
import { formatPhoneBR } from "@/lib/phone";
import { fmtDateISOSP } from "@/lib/spTime";
import { scheduleReengagementIfEnabled } from "@/lib/welcomeReengagement";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Cake, CalendarClock, Check, CreditCard, FileText, MapPin, Phone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BENEFIT_OPTIONS, PLAN_OPTIONS } from "./studentPlans";
import type { Student } from "./studentListModel";

interface EditarAlunoDialogProps {
  student: Student;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarAlunoDialog({ student, open, onOpenChange }: EditarAlunoDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const saveRunning = useRef(false);
  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    dataNascimento: "",
    plano: "Mensal",
    status: "active",
    cidade: "",
    cpf: "",
    vencimento: "",
    inicio: "",
    beneficio: "",
    messagesEnabled: true,
  });

  useEffect(() => {
    if (student) {
      setFormData({
        nome: student.name,
        telefone: student.phone,
        dataNascimento: student.birth_date || "",
        plano: student.plan || "Mensal",
        status: student.status || "active",
        cidade: student.city || "",
        cpf: student.cpf || "",
        vencimento: student.payment_due_date || "",
        inicio: student.enrollment_date || "",
        beneficio: student.benefit || "",
        messagesEnabled: student.messages_enabled !== false,
      });
    }
  }, [student]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    handleInputChange('telefone', formatted);
  };

  const phoneCheck = formatPhoneBR(formData.telefone);
  const validateForm = () => {
    if (!formData.nome.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return false;
    }
    if (!phoneCheck.ok) {
      toast({ title: "Telefone inválido", description: phoneCheck.reason, variant: "destructive" });
      return false;
    }
    if (formData.cpf.trim() && !isValidCpf(formData.cpf)) {
      toast({ title: "CPF inválido", description: "Confira os dígitos do CPF.", variant: "destructive" });
      return false;
    }
    if (formData.dataNascimento && formData.dataNascimento > fmtDateISOSP(new Date())) {
      toast({ title: "Confira o nascimento", description: "A data não pode ser futura.", variant: "destructive" });
      return false;
    }
    if (formData.inicio && (formData.inicio > fmtDateISOSP(new Date()) ||
        (formData.dataNascimento && formData.inicio < formData.dataNascimento))) {
      toast({ title: "Confira o início na academia", description: "Use uma data até hoje, a partir do nascimento.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveRunning.current || !validateForm()) return;
    saveRunning.current = true;
    setIsLoading(true);

    try {
      const wasActive = (student.status || "active") === "active";
      const nowInactive = formData.status !== "active";
      if (wasActive && nowInactive) {
        const accepted = await confirm({
          title: "Inativar aluno?",
          description: `${student.name} será inativado ao salvar. O histórico será preservado o reengajamento só será agendado se as mensagens deste aluno forem permitidas e a automação estiver habilitada.`,
          confirmLabel: "Inativar e salvar",
          destructive: true,
        });
        if (!accepted) return;
      }
      if (student.messages_enabled !== false && !formData.messagesEnabled) {
        const accepted = await confirm({
          title: "Desativar mensagens deste aluno?",
          description: "O cadastro continuará disponível. Mensagens pendentes serão canceladas e novos envios serão bloqueados. Um envio que já começou ainda pode chegar. Ao reativar, mensagens canceladas não voltam à fila.",
          confirmLabel: "Desativar mensagens e salvar",
          destructive: true,
        });
        if (!accepted) return;
      }
      const studentData = {
        name: formData.nome.trim(),
        phone: phoneCheck.number,
        birth_date: formData.dataNascimento || null,
        plan: formData.plano,
        status: formData.status,
        city: formData.cidade.trim() || null,
        cpf: formData.cpf.trim() ? unmaskCpf(formData.cpf) : null,
        payment_due_date: formData.vencimento || null,
        enrollment_date: formData.inicio || null,
        benefit: formData.beneficio || null,
        messages_enabled: formData.messagesEnabled,
      };

      // Save only while the editable fields still match the opened record.
      // This also protects a renewal made in another tab from a stale edit.
      let update = supabase.from("students").update(studentData).eq("id", student.id);
      for (const field of Object.keys(studentData) as (keyof typeof studentData)[]) {
        const original = field === "messages_enabled" ? student.messages_enabled !== false : student[field] ?? null;
        update = original === null ? update.is(field, null) : update.eq(field, original);
      }
      const { data, error } = await update.select("id").maybeSingle();

      if (error) throw error;
      if (!data) {
        queryClient.invalidateQueries({ queryKey: ['students'] });
        throw new Error("O aluno foi alterado em outra tela ou não está mais disponível. Atualize a lista e tente novamente.");
      }

      const reengagement = wasActive && nowInactive && formData.messagesEnabled
        ? await scheduleReengagementIfEnabled(student.id, formData.nome.trim())
        : "disabled";

      queryClient.invalidateQueries({ queryKey: ["message-composer-data"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages"] });
      queryClient.invalidateQueries({ queryKey: ["student-record", student.id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-evaluation-agenda'] });
      queryClient.invalidateQueries({ queryKey: ['students-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['today-actions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-scheduled-by-student'] });
      queryClient.invalidateQueries({ queryKey: ['student-recent-msgs', student.id] });
      queryClient.invalidateQueries({ queryKey: ['student-plan-history', student.id] });

      toast({
        title: "Aluno atualizado com sucesso!",
        description: reengagement === "failed"
          ? `Os dados de ${formData.nome} foram salvos, mas não foi possível agendar a mensagem automática.`
          : `Os dados de ${formData.nome} foram atualizados.`,
      });

      onOpenChange(false);

    } catch (error: unknown) {
      console.error('Error updating student:', error);
      toast({
        title: "Erro ao atualizar aluno",
        description: errorMessage(error, "Tente novamente em alguns instantes."),
        variant: "destructive"
      });
    } finally {
      saveRunning.current = false;
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isLoading) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Aluno</DialogTitle>
          <DialogDescription>
            Atualize as informações do aluno
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <fieldset disabled={isLoading} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-nome" className="text-sm font-medium">
              Nome completo *
            </Label>
            <Input
              id="edit-nome"
              type="text"
              placeholder="Ex: João Silva"
              value={formData.nome}
              onChange={(e) => handleInputChange('nome', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-telefone" className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              WhatsApp *
            </Label>
            <Input
              id="edit-telefone"
              type="tel"
              placeholder="(11) 99999-9999"
              value={formData.telefone}
              onChange={handlePhoneChange}
              maxLength={20}
            />
            {formData.telefone.trim() && (
              phoneCheck.ok ? (
                <p className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> {phoneCheck.formatted}</p>
              ) : (
                <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> {phoneCheck.reason}</p>
              )
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-dataNascimento" className="text-sm font-medium flex items-center gap-2">
              <Cake className="h-4 w-4" />
              Data de nascimento
            </Label>
            <Input
              id="edit-dataNascimento"
              type="date"
              value={formData.dataNascimento}
              onChange={(e) => handleInputChange('dataNascimento', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-cidade" className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Cidade
            </Label>
            <Input
              id="edit-cidade"
              type="text"
              placeholder="Ex: São Paulo"
              value={formData.cidade}
              onChange={(e) => handleInputChange('cidade', e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-cpf" className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CPF
            </Label>
            <Input
              id="edit-cpf"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={maskCpf(formData.cpf)}
              onChange={(e) => handleInputChange('cpf', unmaskCpf(e.target.value))}
              maxLength={14}
            />
            {formData.cpf.trim() && (
              isValidCpf(formData.cpf) ? (
                <p className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> CPF válido</p>
              ) : (
                <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> CPF inválido</p>
              )
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-vencimento" className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Vencimento da mensalidade
            </Label>
            <Input
              id="edit-vencimento"
              type="date"
              value={formData.vencimento}
              onChange={(e) => handleInputChange('vencimento', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-plano" className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Plano
            </Label>
            <Select value={formData.plano} onValueChange={(v) => handleInputChange('plano', v)}>
              <SelectTrigger id="edit-plano">
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2"><Label htmlFor="edit-inicio">Início na academia</Label><Input id="edit-inicio" type="date" value={formData.inicio} onChange={e => handleInputChange("inicio", e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="edit-beneficio">Benefício ou convênio</Label><Select value={formData.beneficio || "none"} onValueChange={value => handleInputChange("beneficio", value === "none" ? "" : value)}><SelectTrigger id="edit-beneficio"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem benefício</SelectItem>{BENEFIT_OPTIONS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2">
            <Label htmlFor="edit-status" className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Status
            </Label>
            <Select value={formData.status} onValueChange={(v) => handleInputChange('status', v)}>
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={formData.messagesEnabled} onChange={event => handleInputChange("messagesEnabled", event.target.checked)} /><span>Permitir mensagens pelo WhatsApp</span></label>
            <p className="text-xs text-muted-foreground">Independente da matrícula. Desmarque se o aluno não quiser receber mensagens manuais, lembretes ou automações. Envios pendentes serão cancelados ao salvar; um envio já iniciado ainda pode chegar.</p>
          </div>
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !phoneCheck.ok || !formData.nome.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
