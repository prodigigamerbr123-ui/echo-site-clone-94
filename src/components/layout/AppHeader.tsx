import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Bot, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import workoutLogo from "@/assets/workout-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";

export function AppHeader() {
  const { signOut, role } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="h-16 bg-card border-b border-border shadow-card">
      <div className="h-full flex items-center justify-between pl-1 pr-4">
        <div className="flex items-center gap-0">
          <img
            src={workoutLogo}
            alt="Workout Academia"
            className="max-h-10 w-28 object-contain sm:w-36"
          />
          <SidebarTrigger />
        </div>

        <div className="flex items-center gap-2">
          {(import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK)) && <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Abrir Assistente IA"
            title="Assistente IA"
          >
            <Link to="/assistente-ia">
              <Bot className="h-5 w-5" />
            </Link>
          </Button>}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sair"
            title="Sair"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
