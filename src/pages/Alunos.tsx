import { Users } from "lucide-react";
import { ListaAlunos } from "@/components/alunos/ListaAlunos";

export default function Alunos() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-lg">
          <Users className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ver Alunos</h1>
          <p className="text-muted-foreground">
            Lista completa dos alunos da academia
          </p>
        </div>
      </div>

      <ListaAlunos />
    </div>
  );
}
