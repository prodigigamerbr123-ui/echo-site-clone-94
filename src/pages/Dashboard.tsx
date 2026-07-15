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
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <SectionDivider label="Atalhos Rápidos" />

      <QuickActions />

      <SectionDivider label="Números" />
      <StatsOverview />
    </div>
  );
}

