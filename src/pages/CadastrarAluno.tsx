
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Users, Phone, Calendar, CheckCircle, Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleAutomaticMessages } from "@/utils/scheduleMessages";

export default function CadastrarAluno() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    dataNascimento: "",
    dataUltimaAvaliacao: "",
    fezAvaliacaoFisica: false
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatPhone = (value: string) => {
    // Remove all non-numeric characters
    const numbers = value.replace(/\D/g, '');
    
    // Format as (11) 99999-9999
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

    // Basic phone validation
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
      // Prepare data for Supabase
      const studentData = {
        name: formData.nome.trim(),
        phone: formData.telefone,
        birth_date: formData.dataNascimento || null,
        last_evaluation_date: formData.dataUltimaAvaliacao || null,
        had_evaluation: formData.fezAvaliacaoFisica
      };

      // Save to Supabase
      const { data, error } = await supabase
        .from('students')
        .insert([studentData])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Schedule automatic messages for 7, 21, and 45 days
      await scheduleAutomaticMessages({
        id: data.id,
        name: data.name
      });

      // Invalidate dashboard queries to refresh stats
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['today-actions'] });
      
      toast({
        title: "Aluno cadastrado com sucesso!",
        description: `${formData.nome} foi adicionado ao sistema e mensagens automáticas foram agendadas.`,
      });

      // Reset form
      setFormData({
        nome: "",
        telefone: "",
        dataNascimento: "",
        dataUltimaAvaliacao: "",
        fezAvaliacaoFisica: false
      });

    } catch (error: any) {
      console.error('Error saving student:', error);
      toast({
        title: "Erro ao cadastrar aluno",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-lg">
          <Users className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cadastrar Aluno</h1>
          <p className="text-muted-foreground">
            Adicione um novo aluno ao sistema de mensagens
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card className="max-w-2xl shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Dados do Aluno
          </CardTitle>
          <CardDescription>
            Preencha as informações do aluno para começar a enviar mensagens automáticas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="nome" className="text-sm font-medium">
                Nome completo *
              </Label>
              <Input
                id="nome"
                type="text"
                placeholder="Ex: João Silva"
                value={formData.nome}
                onChange={(e) => handleInputChange('nome', e.target.value)}
                className="h-11"
              />
            </div>

            {/* Telefone */}
            <div className="space-y-2">
              <Label htmlFor="telefone" className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                WhatsApp *
              </Label>
              <Input
                id="telefone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={formData.telefone}
                onChange={handlePhoneChange}
                className="h-11"
                maxLength={15}
              />
              <p className="text-xs text-muted-foreground">
                Formato: (11) 99999-9999 - Incluir DDD
              </p>
            </div>

            {/* Data de nascimento */}
            <div className="space-y-2">
              <Label htmlFor="dataNascimento" className="text-sm font-medium flex items-center gap-2">
                <Cake className="h-4 w-4" />
                Data de nascimento
              </Label>
              <Input
                id="dataNascimento"
                type="date"
                value={formData.dataNascimento}
                onChange={(e) => handleInputChange('dataNascimento', e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Usado para enviar mensagens de aniversário
              </p>
            </div>

            {/* Data da última avaliação */}
            <div className="space-y-2">
              <Label htmlFor="dataUltimaAvaliacao" className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Data da última avaliação física
              </Label>
              <Input
                id="dataUltimaAvaliacao"
                type="date"
                value={formData.dataUltimaAvaliacao}
                onChange={(e) => handleInputChange('dataUltimaAvaliacao', e.target.value)}
                className="h-11"
              />
            </div>

            {/* Switch Avaliação Física */}
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="fezAvaliacaoFisica" className="text-sm font-medium">
                  Fez avaliação física?
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marque se o aluno já realizou avaliação física na academia
                </p>
              </div>
              <Switch
                id="fezAvaliacaoFisica"
                checked={formData.fezAvaliacaoFisica}
                onCheckedChange={(checked) => handleInputChange('fezAvaliacaoFisica', checked)}
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                    Cadastrando...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Cadastrar Aluno
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="max-w-2xl bg-accent/50 shadow-card">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">
                Mensagens Automáticas
              </h3>
              <p className="text-sm text-muted-foreground">
                Após o cadastro, mensagens automáticas serão agendadas para 7, 21 e 45 dias 
                para acompanhar o progresso do aluno. Se informada a data de nascimento, 
                mensagens de aniversário também serão enviadas automaticamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
