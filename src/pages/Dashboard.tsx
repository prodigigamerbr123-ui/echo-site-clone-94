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

      <details className="rounded-lg border bg-card p-5"><summary className="cursor-pointer font-semibold">Consultar todos os números da academia</summary><div className="mt-5"><StatsOverview /></div></details>

      {canUseAI && <details className="rounded-lg border bg-card p-5"><summary className="cursor-pointer font-semibold">Ideias de comunicação · opcional</summary><div className="mt-5"><AISuggestions /></div></details>}
    </div>
  );
}
