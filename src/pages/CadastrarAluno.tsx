import { UserPlus } from "lucide-react";
import { CadastrarAlunoForm } from "@/components/alunos/CadastrarAlunoForm";

export default function CadastrarAluno() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-lg">
          <UserPlus className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cadastrar Aluno</h1>
          <p className="text-muted-foreground">
            Adicione um novo aluno à academia
          </p>
        </div>
      </div>

      <CadastrarAlunoForm />
    </div>
  );
}
