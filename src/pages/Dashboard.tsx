import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { QuickActions } from "@/components/dashboard/QuickActions";

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

export default function Dashboard() {
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {greeting}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Visão geral da Academia Workout
        </p>
      </div>

      <SectionDivider label="Atalhos Rápidos" />
      <QuickActions />

      <SectionDivider label="Números" />
      <StatsOverview />
    </div>
  );
}
