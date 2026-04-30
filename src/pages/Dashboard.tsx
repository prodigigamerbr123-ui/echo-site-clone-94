import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";
import { QuickActions } from "@/components/dashboard/QuickActions";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da sua academia</p>
      </div>

      <QuickActions />

      <StatsOverview />

      <div className="max-w-xl">
        <WhatsAppStatus />
      </div>
    </div>
  );
}
