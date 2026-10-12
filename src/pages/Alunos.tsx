import { usePageTitle } from "@/hooks/usePageTitle";
import { Users, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ListaAlunos } from "@/components/alunos/ListaAlunos";
import { useAuth } from "@/hooks/useAuth";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";

export default function Alunos() {
  usePageTitle("Alunos");
  const { role } = useAuth();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
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
        {(import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK)) && <Button asChild>
          <Link to="/cadastrar-aluno">
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar aluno
          </Link>
        </Button>}
      </div>

      <ListaAlunos />
    </div>
  );
}
