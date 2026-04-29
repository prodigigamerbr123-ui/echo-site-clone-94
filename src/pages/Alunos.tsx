
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserPlus, List } from "lucide-react";
import { CadastrarAlunoForm } from "@/components/alunos/CadastrarAlunoForm";
import { ListaAlunos } from "@/components/alunos/ListaAlunos";

export default function Alunos() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'lista' ? 'lista' : 'cadastrar');

  useEffect(() => {
    if (tabFromUrl === 'lista') {
      setActiveTab('lista');
    }
  }, [tabFromUrl]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-lg">
          <Users className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Alunos</h1>
          <p className="text-muted-foreground">
            Gerencie os alunos da academia
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cadastrar" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Cadastrar Aluno
          </TabsTrigger>
          <TabsTrigger value="lista" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Lista de Alunos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastrar">
          <CadastrarAlunoForm />
        </TabsContent>

        <TabsContent value="lista">
          <ListaAlunos />
        </TabsContent>
      </Tabs>
    </div>
  );
}
