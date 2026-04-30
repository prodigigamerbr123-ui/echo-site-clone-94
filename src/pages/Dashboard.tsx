
import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { StudentsSummary } from "@/components/dashboard/StudentsSummary";
import { SystemStatus } from "@/components/dashboard/SystemStatus";
import { WelcomeSection } from "@/components/dashboard/WelcomeSection";
import { AISuggestions } from "@/components/dashboard/AISuggestions";
import { WhatsAppStatus } from "@/components/dashboard/WhatsAppStatus";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <WelcomeSection />

      {/* Stats Overview */}
      <StatsOverview />

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <StudentsSummary />
        </div>
        <div className="space-y-6">
          <WhatsAppStatus />
          <AISuggestions />
          <SystemStatus />
        </div>
      </div>
    </div>
  );
}
