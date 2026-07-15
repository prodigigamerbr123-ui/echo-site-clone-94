import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";
import { AutomationStatusCard } from "@/components/dashboard/AutomationStatusCard";
import { TodayInbox } from "@/components/dashboard/TodayInbox";

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <SectionDivider label="Hoje" />
      <TodayInbox />

      <SectionDivider label="Números" />
      <StatsOverview />

      <SectionDivider label="Automação" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AutomationStatusCard />
        </div>
        <div className="lg:col-span-2">
          <WhatsAppStatus />
        </div>
      </div>
    </div>
  );
}
