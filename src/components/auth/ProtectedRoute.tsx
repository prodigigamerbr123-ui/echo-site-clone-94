import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { hasRole, ALL_STAFF, type StaffRole } from "@/lib/staffRoles";

export function ProtectedRoute({ children, allowedRoles = ALL_STAFF }: { children: ReactNode; allowedRoles?: readonly StaffRole[] }) {
  const previewMode = import.meta.env.VITE_PREVIEW_MODE === "true";
  const { session, loading, role, roleLoading, roleError, signOut } = useAuth();
  const location = useLocation();

  if (previewMode) {
    return <>{children}</>;
  }

  if (loading || (session && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasRole(role, allowedRoles)) {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
        <p className="text-muted-foreground">{roleError
          ? "Não foi possível verificar suas permissões. Tente entrar novamente."
          : "Seu usuário não possui permissão ativa para acessar esta área."}</p>
        <Button onClick={() => void signOut()}>Sair da conta</Button>
      </div>
    );
  }

  return <>{children}</>;
}
