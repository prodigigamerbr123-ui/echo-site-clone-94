import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import workoutLogo from "@/assets/workout-combined-v2.png.asset.json";

export function AppHeader() {
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

        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
