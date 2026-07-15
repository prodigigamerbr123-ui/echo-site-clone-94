
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Phone, Calendar, Cake, CreditCard, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { PLAN_OPTIONS } from "./CadastrarAlunoForm";

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
    dataUltimaAvaliacao: "",
    fezAvaliacaoFisica: false,
    plano: "Mensal",
    status: "active",
  });

  useEffect(() => {
    if (student) {
      setFormData({
        nome: student.name,
        telefone: student.phone,
        dataNascimento: student.birth_date || "",
        dataUltimaAvaliacao: student.last_evaluation_date || "",
        fezAvaliacaoFisica: student.had_evaluation,
        plano: student.plan || "Mensal",
        status: student.status || "active",
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

  const validateForm = () => {
    if (!formData.nome.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, insira o nome do aluno.",
        variant: "destructive"
      });
      return false;
    }

    if (!formData.telefone.trim()) {
      toast({
        title: "Telefone obrigatório",
        description: "Por favor, insira o número do WhatsApp.",
        variant: "destructive"
      });
      return false;
    }

    const phoneNumbers = formData.telefone.replace(/\D/g, '');
    if (phoneNumbers.length < 10 || phoneNumbers.length > 11) {
      toast({
        title: "Telefone inválido",
        description: "Por favor, insira um número de telefone válido.",
        variant: "destructive"
      });
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
        last_evaluation_date: formData.dataUltimaAvaliacao || null,
        had_evaluation: formData.fezAvaliacaoFisica,
        plan: formData.plano,
        status: formData.status,
      };

      const { error } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', student.id);

      if (error) throw error;

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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Aluno</DialogTitle>
          <DialogDescription>
            Atualize as informações do aluno
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
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

          {/* Telefone */}
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
          </div>

          {/* Data de nascimento */}
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

          {/* Data da última avaliação */}
          <div className="space-y-2">
            <Label htmlFor="edit-dataUltimaAvaliacao" className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Data da última avaliação física
            </Label>
            <Input
              id="edit-dataUltimaAvaliacao"
              type="date"
              value={formData.dataUltimaAvaliacao}
              onChange={(e) => handleInputChange('dataUltimaAvaliacao', e.target.value)}
            />
          </div>

          {/* Plano */}
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

          {/* Status */}
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

          {/* Switch Avaliação Física */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="edit-fezAvaliacaoFisica" className="text-sm font-medium">
                Fez avaliação física?
              </Label>
            </div>
            <Switch
              id="edit-fezAvaliacaoFisica"
              checked={formData.fezAvaliacaoFisica}
              onCheckedChange={(checked) => handleInputChange('fezAvaliacaoFisica', checked)}
            />
          </div>

          {/* Buttons */}
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
              disabled={isLoading}
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
