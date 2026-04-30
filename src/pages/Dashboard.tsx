import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AISuggestions } from "@/components/dashboard/AISuggestions";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <QuickActions />

      <StatsOverview />

      <AISuggestions />

      <div className="max-w-xl">
        <WhatsAppStatus />
      </div>
    </div>
  );
}
