import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AISuggestions } from "@/components/dashboard/AISuggestions";
import { AutomationStatusCard } from "@/components/dashboard/AutomationStatusCard";

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
      <QuickActions />

      <SectionDivider label="Visão Geral" />
      <StatsOverview />

      <SectionDivider label="Automação" />
      <AutomationStatusCard />

      <SectionDivider label="Inteligência" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AISuggestions />
        </div>
        <div className="lg:col-span-2">
          <WhatsAppStatus />
        </div>
      </div>
    </div>
  );
}
