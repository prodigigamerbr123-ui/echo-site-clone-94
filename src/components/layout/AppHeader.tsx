


import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AppHeader() {
  return (
    <header className="h-16 bg-card border-b border-border shadow-card">
      <div className="h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <div className="flex items-center gap-1">
            <img 
              src="/lovable-uploads/7c1bda60-c827-4e54-99c3-c6836bf4f3c7.png" 
              alt="Workout Academy" 
              className="h-8 w-auto"
            />
            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              WORKOUT
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}


