import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";
import { QuickActions } from "@/components/dashboard/QuickActions";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <QuickActions />

      <StatsOverview />

      <div className="max-w-xl">
        <WhatsAppStatus />
      </div>
    </div>
  );
}
