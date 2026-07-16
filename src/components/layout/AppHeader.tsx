import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Bot, Settings, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import workoutLogo from "@/assets/workout-combined-v2.png.asset.json";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="h-16 bg-card border-b border-border shadow-card">
      <div className="h-full flex items-center justify-between pl-1 pr-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <img
            src={workoutLogo.url}
            alt="Workout Academia"
            className="h-10 w-auto object-contain"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Abrir Assistente IA"
            title="Assistente IA"
          >
            <Link to="/assistente-ia">
              <Bot className="h-5 w-5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Configurações"
            title="Configurações"
          >
            <Link to="/configuracoes">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
