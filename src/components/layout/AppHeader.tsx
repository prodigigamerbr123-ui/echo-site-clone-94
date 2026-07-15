import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import workoutIcon from "@/assets/workout-icon.png.asset.json";
import workoutWordmark from "@/assets/workout-wordmark.png.asset.json";

export function AppHeader() {
  return (
    <header className="h-16 bg-card border-b border-border shadow-card">
      <div className="h-full flex items-center justify-between pl-1 pr-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <div className="flex items-center gap-0.5">
            <img
              src={workoutIcon.url}
              alt="Workout"
              className="h-10 w-auto object-contain"
            />
            <img
              src={workoutWordmark.url}
              alt="Workout Academia"
              className="h-7 w-auto object-contain -ml-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
