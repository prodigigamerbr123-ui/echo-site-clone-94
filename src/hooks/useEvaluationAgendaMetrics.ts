import { useMemo } from "react";

import { spDate, spIsToday, spParts, spStartOfDay } from "@/lib/spTime";

interface EvaluationMetricItem {
  scheduled_at: string;
  status: string;
}

export function useEvaluationAgendaMetrics(evaluations: EvaluationMetricItem[] | undefined, timestamp: number) {
  return useMemo(() => {
    const items = evaluations ?? [];
    const now = new Date(timestamp);
    const scheduled = items.filter(
      (e) => e.status === "scheduled" && new Date(e.scheduled_at) >= spStartOfDay(now),
    ).length;
    const today = items.filter(
      (e) => e.status === "scheduled" && spIsToday(new Date(e.scheduled_at), now),
    ).length;
    const nowSP = spParts(now);
    const monthStart = spDate(nowSP.y, nowSP.mo, 1, 0, 0);
    const monthEnd = spDate(nowSP.y, nowSP.mo + 1, 1, 0, 0);
    const noShowMonth = items.filter(
      (e) => e.status === "no_show" && new Date(e.scheduled_at) >= monthStart && new Date(e.scheduled_at) < monthEnd,
    ).length;

    return { scheduled, today, noShowMonth };
  }, [evaluations, timestamp]);
}
