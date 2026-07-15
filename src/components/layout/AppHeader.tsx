import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import workoutLogo from "@/assets/workout-logo-full.png.asset.json";

export function AppHeader() {
  return (
    <header className="h-16 bg-card border-b border-border shadow-card">
      <div className="h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <img
            src={workoutLogo.url}
            alt="Workout Academia"
            className="h-12 w-auto object-contain"
          />
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
