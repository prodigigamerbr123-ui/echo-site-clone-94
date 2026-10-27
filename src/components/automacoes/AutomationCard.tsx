import { readOverdueParams } from "../../../supabase/functions/_shared/paymentOverdue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AutomationSettingsMap, automationTemplates, type AutomationParams } from "@/lib/automationSettings";
import { Eye, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AutomationDef, PredefinedMsg } from "@/lib/automationCatalog";

export function AutomationCard({
  def, settings, predefined, perTypeCounts,
  onToggle, onSaveParams, onLinkTemplate, onCreateNew, onPreview, saving,
}: {
  def: AutomationDef;
  settings: AutomationSettingsMap | undefined;
  predefined: PredefinedMsg[];
  perTypeCounts: Record<string, number>;
  onToggle: (enabled: boolean) => void;
  onSaveParams: (params: AutomationParams) => void;
  onLinkTemplate: (messageType: string, predefinedId: string | null) => void;
  onCreateNew: (messageType: string, suggestedTitle: string) => void;
  onPreview: (msg: PredefinedMsg) => void;
  saving: boolean;
}) {
  const setting = settings?.[def.key];
  const enabled = !!setting?.enabled;
  const templates = automationTemplates(setting?.params);

  const initialParams = useMemo(() => {
    const p: Record<string, number | string> = {};
    for (const pd of def.params ?? []) {
      const raw = setting?.params?.[pd.name];
      p[pd.name] = def.key === "payment_overdue"
        ? raw === undefined ? pd.fallback : typeof raw === "number" || typeof raw === "string" ? raw : ""
        : Number(raw ?? pd.fallback);
    }
    return p;
  }, [setting, def.params, def.key]);

  const [localParams, setLocalParams] = useState<Record<string, number | string>>(initialParams);
  useEffect(() => setLocalParams(initialParams), [initialParams]);

  let paramsError: string | null = null;
  if (def.key === "payment_overdue") {
    try { readOverdueParams(localParams); }
    catch (error) { paramsError = error instanceof Error ? error.message : "Confira os parâmetros."; }
  }

  const count30d = def.messageTypes.reduce((s, mt) => s + (perTypeCounts[mt.type] ?? 0), 0);
  const dirty =
    def.params?.some((pd) => Number(localParams[pd.name]) !== Number(initialParams[pd.name])) ??
    false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{def.title}</CardTitle>
            <CardDescription className="mt-1">{def.description}</CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <span className="font-medium">Quando roda: </span>
          <span className="text-muted-foreground">{def.when}</span>
        </div>

        <div className="space-y-3 pt-1">
          <div className="text-xs font-medium text-muted-foreground">
            {def.messageTypes.length > 1 ? "Mensagens enviadas" : "Mensagem enviada"}
          </div>
          {def.messageTypes.map((mt) => {
            const selectedId = templates[mt.type];
            const selectedMsg = selectedId ? predefined.find((p) => p.id === selectedId) : null;
            return (
              <div key={mt.type} className="space-y-1">
                {def.messageTypes.length > 1 && (
                  <Label className="text-xs">{mt.label}</Label>
                )}
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedId ?? ""}
                    onValueChange={(v) => {
                      if (v === "__new__") {
                        onCreateNew(mt.type, `${def.title} — ${mt.label}`);
                      } else {
                        onLinkTemplate(mt.type, v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Escolher mensagem" />
                    </SelectTrigger>
                    <SelectContent>
                      {predefined.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                      <SelectItem value="__new__">
                        <span className="flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" /> Criar nova mensagem
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedMsg && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0"
                      onClick={() => onPreview(selectedMsg)}
                      title="Ver texto"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Placeholders: {def.placeholders.join(", ")}
          </p>
        </div>

        {def.params && def.params.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <div className="grid grid-cols-2 gap-3">
              {def.params.map((pd) => (
                <div key={pd.name} className="space-y-1">
                  <Label htmlFor={`${def.key}-${pd.name}`} className="text-xs">
                    {pd.label}
                  </Label>
                  <Input
                    id={`${def.key}-${pd.name}`}
                    type="number"
                    min={def.key === "payment_overdue" ? 1 : 0}
                    step={1}
                    aria-invalid={!!paramsError}
                    aria-describedby={paramsError ? `${def.key}-params-error` : undefined}
                    value={localParams[pd.name] ?? ""}
                    onChange={(e) =>
                      setLocalParams((p) => ({
                        ...p,
                        [pd.name]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            {paramsError && <p id={`${def.key}-params-error`} role="alert" className="text-sm text-destructive">{paramsError}</p>}
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || saving || !!paramsError}
              onClick={() =>
                onSaveParams({ ...(setting?.params ?? {}), ...Object.fromEntries(Object.entries(localParams).map(([key, value]) => [key, Number(value)])) })
              }
            >
              Salvar parâmetros
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">Mensagens (últimos 30 dias)</span>
          <Badge variant="secondary">{count30d}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
