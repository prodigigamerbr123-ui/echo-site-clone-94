import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Bot, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { AISuggestions } from "./AISuggestions";

const CACHE_KEY = "dailyBriefing:v1";

type Cache = { date: string; briefing: string; generatedAt: string };

function todayKey() {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function AIInsightsPanel() {
  const [briefing, setBriefing] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = async (force = false) => {
    setError(null);
    if (!force) {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        try {
          const c: Cache = JSON.parse(raw);
          if (c.date === todayKey() && c.briefing) {
            setBriefing(c.briefing);
            setGeneratedAt(c.generatedAt);
            return;
          }
        } catch {}
      }
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-briefing", { body: {} });
      if (error) throw error;
      if (data?.briefing) {
        setBriefing(data.briefing);
        setGeneratedAt(data.generatedAt);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ date: todayKey(), briefing: data.briefing, generatedAt: data.generatedAt } satisfies Cache)
        );
      } else {
        setError("Resposta vazia da IA.");
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar briefing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20 shadow-elegant relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-cyan-500/5 pointer-events-none" />
        <CardHeader className="relative">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-primary/30 blur-lg animate-pulse" />
                <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shadow-primary">
                  <Bot className="h-5 w-5" />
                </div>
              </div>
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  Sugestões da IA
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px] gap-1">
                    <Zap className="h-3 w-3" /> IA
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Briefing diário inteligente — varredura completa do sistema
                  {generatedAt && (
                    <span className="ml-1 text-[11px] opacity-70">
                      · {new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(true)}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Analisando..." : "Atualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="relative">
          {loading && !briefing ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive p-3 rounded-md bg-destructive/10 border border-destructive/20">
              {error}
            </div>
          ) : briefing ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-headings:mb-2 prose-headings:mt-4 prose-p:my-2 prose-ul:my-2">
              <ReactMarkdown>{briefing}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Clique em "Atualizar" para gerar o briefing do dia.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AISuggestions />
    </div>
  );
}
