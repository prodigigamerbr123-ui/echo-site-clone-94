import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bot, AlertTriangle, Hand } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AUTO_EVAL_MESSAGE_TYPES } from "@/lib/evaluationMessages";

const AUTO_TYPES = [
  ...AUTO_EVAL_MESSAGE_TYPES,
  "evaluation_reminder",
  "evaluation_followup",
  "evaluation_reschedule",
  "birthday",
];

export function AutomationStatusCard() {
  const { data } = useQuery({
    queryKey: ["automation-status-v2"],
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

      const [autoToday, manualToday, failed24h, pending] = await Promise.all([
        supabase.from("scheduled_messages").select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString()).in("message_type", AUTO_TYPES),
        supabase.from("scheduled_messages").select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString()).not("message_type", "in", `(${AUTO_TYPES.map(t => `"${t}"`).join(",")})`),
        supabase.from("scheduled_messages").select("id", { count: "exact", head: true })
          .eq("status", "failed").gte("updated_at", dayAgo.toISOString()),
        supabase.from("scheduled_messages").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      return {
        autoToday: autoToday.count ?? 0,
        manualToday: manualToday.count ?? 0,
        failed24h: failed24h.count ?? 0,
        pending: pending.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-primary" /> Motor de Automação
        </CardTitle>
        <CardDescription>Como está a fila e o que o motor fez hoje</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" /> Motor hoje
            </div>
            <div className="text-2xl font-bold text-primary mt-1">{data?.autoToday ?? 0}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hand className="h-3.5 w-3.5" /> Você hoje
            </div>
            <div className="text-2xl font-bold mt-1">{data?.manualToday ?? 0}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Falhas 24h
            </div>
            <div className="text-2xl font-bold text-destructive mt-1">{data?.failed24h ?? 0}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Pendentes</div>
            <div className="text-2xl font-bold mt-1">{data?.pending ?? 0}</div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/mensagens-agendadas">Ver fila</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
