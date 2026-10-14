import { AutomationCard } from "@/components/automacoes/AutomationCard";
import { CreatePredefinedDialog } from "@/components/automacoes/CreatePredefinedDialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAutomationManager } from "@/hooks/useAutomationManager";
import { usePageTitle } from "@/hooks/usePageTitle";
import { AUTOMATIONS, type PredefinedMsg } from "@/lib/automationCatalog";
import { useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { useState } from "react";

export default function Automacoes() {
  usePageTitle("Automações");
  const qc = useQueryClient();

  const {
    settings, predefined, latestRun, lastSuccess, runHistory, runHistoryError,
    overdueQueue, overdueQueueError, runningTooLong, cronOverdue, unhealthy,
    monthCount, last30Count, perTypeCounts, toggleMutation, paramsMutation, templateMutation,
  } = useAutomationManager();

  const [creatingFor, setCreatingFor] = useState<{
    key: string; messageType: string; suggestedTitle: string;
  } | null>(null);
  const [previewFor, setPreviewFor] = useState<PredefinedMsg | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Zap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Automações</h1>
          <p className="text-muted-foreground">
            Ligue, desligue e escolha a mensagem enviada em cada automação.
          </p>
        </div>
      </div>

      {unhealthy && (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <strong>Atenção às automações: </strong>
          {runHistoryError ? "Não foi possível consultar o histórico de execuções. " : ""}
          {runHistory && !latestRun ? "Nenhuma execução registrada; confira o cron após o horário programado. " : ""}
          {overdueQueueError ? "Não foi possível consultar a fila. " : ""}
          {latestRun?.status === "failed" ? `${latestRun.error_message ?? "A última execução falhou."} ` : ""}
          {runningTooLong ? "Execução em andamento há mais de 20 minutos. " : ""}
          {cronOverdue ? "O motor não inicia há mais de 26 horas. " : ""}
          {overdueQueue > 0 ? `${overdueQueue} mensagem(ns) pendente(s) há mais de 5 minutos.` : ""}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Última execução do motor</CardDescription>
            <CardTitle className="text-lg">
              {latestRun ? new Date(latestRun.started_at).toLocaleString("pt-BR") : "—"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {runHistoryError ? "Consulta indisponível" : latestRun?.status === "success" ? "Concluída" : latestRun?.status === "failed" ? "Falhou" : latestRun?.status === "running" ? "Em andamento" : "Aguardando primeira execução registrada"}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Última execução bem-sucedida</CardDescription>
            <CardTitle className="text-lg">
              {lastSuccess?.finished_at ? new Date(lastSuccess.finished_at).toLocaleString("pt-BR") : "—"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{overdueQueueError ? "Fila indisponível" : `${overdueQueue} pendentes atrasadas`}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mensagens automáticas no mês</CardDescription>
            <CardTitle className="text-2xl">{monthCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Últimos 30 dias</CardDescription>
            <CardTitle className="text-2xl">{last30Count ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {AUTOMATIONS.map((a) => (
          <AutomationCard
            key={a.key}
            def={a}
            settings={settings}
            predefined={predefined}
            perTypeCounts={perTypeCounts ?? {}}
            onToggle={(enabled) => toggleMutation.mutate({ key: a.key, enabled })}
            onSaveParams={(params) => paramsMutation.mutate({ key: a.key, params })}
            onLinkTemplate={(messageType, predefinedId) =>
              templateMutation.mutate({ key: a.key, messageType, predefinedId })
            }
            onCreateNew={(messageType, suggestedTitle) =>
              setCreatingFor({ key: a.key, messageType, suggestedTitle })
            }
            onPreview={(msg) => setPreviewFor(msg)}
            saving={paramsMutation.isPending}
          />
        ))}
      </div>

      {creatingFor && (
        <CreatePredefinedDialog
          open
          suggestedTitle={creatingFor.suggestedTitle}
          onClose={() => setCreatingFor(null)}
          onCreated={async (msg) => {
            await qc.invalidateQueries({ queryKey: ["predefined-messages"] });
            templateMutation.mutate({
              key: creatingFor.key,
              messageType: creatingFor.messageType,
              predefinedId: msg.id,
            });
            setCreatingFor(null);
          }}
        />
      )}

      {previewFor && (
        <Dialog open onOpenChange={(o) => !o && setPreviewFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{previewFor.title}</DialogTitle>
              <DialogDescription>Texto que será enviado</DialogDescription>
            </DialogHeader>
            <div className="whitespace-pre-wrap text-sm p-3 rounded-md bg-muted">
              {previewFor.content}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewFor(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
