
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Phone, Cake, CreditCard, Activity, Check, X, MapPin, FileText, CalendarClock } from "lucide-react";
import { formatPhoneBR } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { PLAN_OPTIONS } from "./CadastrarAlunoForm";
import { scheduleReengagementIfEnabled } from "@/lib/welcomeReengagement";
import { isValidCpf, maskCpf, unmaskCpf } from "@/lib/cpf";

interface Student {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  last_evaluation_date: string | null;
  had_evaluation: boolean;
  created_at: string;
  plan?: string | null;
  status?: string;
  city?: string | null;
  cpf?: string | null;
  payment_due_date?: string | null;
}

interface EditarAlunoDialogProps {
  student: Student;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarAlunoDialog({ student, open, onOpenChange }: EditarAlunoDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    dataNascimento: "",
    plano: "Mensal",
    status: "active",
    cidade: "",
    cpf: "",
    vencimento: "",
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
    return true;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const studentData = {
        name: formData.nome.trim(),
        phone: formData.telefone,
        birth_date: formData.dataNascimento || null,
        plan: formData.plano,
        status: formData.status,
        city: formData.cidade.trim() || null,
        cpf: formData.cpf.trim() ? unmaskCpf(formData.cpf) : null,
        payment_due_date: formData.vencimento || null,
      };

      const { error } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', student.id);

      if (error) throw error;

      const wasActive = (student.status || "active") === "active";
      const nowInactive = formData.status !== "active";
      if (wasActive && nowInactive) {
        await scheduleReengagementIfEnabled(student.id, formData.nome.trim());
      }

      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      
      toast({
        title: "Aluno atualizado com sucesso!",
        description: `Os dados de ${formData.nome} foram atualizados.`,
      });

      onOpenChange(false);

    } catch (error: any) {
      console.error('Error updating student:', error);
      toast({
        title: "Erro ao atualizar aluno",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Aluno</DialogTitle>
          <DialogDescription>
            Atualize as informações do aluno
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
              maxLength={15}
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
