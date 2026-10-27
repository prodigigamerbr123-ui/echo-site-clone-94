import { usePageTitle } from "@/hooks/usePageTitle";
import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { AISuggestions } from "@/components/dashboard/AISuggestions";
import { useAuth } from "@/hooks/useAuth";
import { FRONT_DESK, hasRole } from "@/lib/staffRoles";
import { DailyWorkPanel } from "@/components/dashboard/DailyWorkPanel";

export default function Dashboard() {
  usePageTitle("Início");
  const { role } = useAuth();
  const canUseAI = import.meta.env.VITE_PREVIEW_MODE === "true" || hasRole(role, FRONT_DESK);
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <DailyWorkPanel />

      <section aria-labelledby="dashboard-numbers" className="space-y-4"><h2 id="dashboard-numbers" className="text-lg font-semibold">Números da academia</h2><StatsOverview /></section>

      {canUseAI && <AISuggestions />}
    </div>
  );
}
