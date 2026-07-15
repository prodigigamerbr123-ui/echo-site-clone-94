import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Phone, CheckCircle, Cake, User, UserPlus, List, ArrowRight, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const PLAN_OPTIONS = [
  "Mensal",
  "Trimestral",
  "Quadrimestral",
  "Semestral",
  "Octomestral",
  "Anual",
  "12 meses",
  "Desconto especial",
  "Desconto especial Taekwondo",
  "Desconto Funcionários AME",
  "Convênio Talento confecções",
];

export function CadastrarAlunoForm() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [successData, setSuccessData] = useState<{ name: string } | null>(null);
  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    dataNascimento: "",
    plano: "Mensal",
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('telefone', formatPhone(e.target.value));
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
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('students')
        .insert([{
          name: formData.nome.trim(),
          phone: formData.telefone,
          birth_date: formData.dataNascimento || null,
          plan: formData.plano,
          had_evaluation: false,
        }])
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-evaluation'] });

      setSuccessData({ name: data.name });
      setFormData({ nome: "", telefone: "", dataNascimento: "", plano: "Mensal" });
    } catch (error: any) {
      toast({
        title: "Erro ao cadastrar aluno",
        description: error.message || "Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (successData) {
    return (
      <Card className="w-full shadow-card">
        <CardContent className="pt-10 pb-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle className="h-9 w-9 text-green-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Aluno cadastrado com sucesso!</h2>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{successData.name}</span> foi adicionado ao sistema.
            </p>
          </div>
          <Separator />
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => setSuccessData(null)} variant="outline" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Cadastrar Outro Aluno
            </Button>
            <Button onClick={() => navigate('/alunos')} className="gap-2">
              <List className="h-4 w-4" />
              Ver Lista de Alunos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      <Card className="w-full shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Dados Pessoais
          </CardTitle>
          <CardDescription>
            Preencha as informações básicas do aluno
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2 lg:col-span-1 md:col-span-2">
              <Label htmlFor="nome" className="text-sm font-medium">
                Nome completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                type="text"
                placeholder="Ex: João Silva"
                value={formData.nome}
                onChange={(e) => handleInputChange('nome', e.target.value)}
                className="h-11"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone" className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                WhatsApp <span className="text-destructive">*</span>
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
              <p className="text-xs text-muted-foreground">Formato: (11) 99999-9999</p>
            </div>

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
              <p className="text-xs text-muted-foreground">Opcional — usada para aniversário</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Plano
          </CardTitle>
          <CardDescription>
            Selecione o plano contratado pelo aluno
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-md">
            <Label htmlFor="plano" className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Plano <span className="text-destructive">*</span>
            </Label>
            <Select value={formData.plano} onValueChange={(v) => handleInputChange('plano', v)}>
              <SelectTrigger id="plano" className="h-11">
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
        {isLoading ? (
          <>
            <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
            Cadastrando...
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Aluno
          </>
        )}
      </Button>
    </form>
  );
}
