import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { isValidCpf, maskCpf, unmaskCpf } from "@/lib/cpf";
import { errorMessage } from "@/lib/errorMessage";
import { formatPhoneBR } from "@/lib/phone";
import { fmtDateISOSP } from "@/lib/spTime";
import { findRegistrationDuplicates, type RegistrationDuplicate } from "@/lib/studentDuplicates";
import { saveStudentRegistration } from "@/lib/studentRegistration";
import { scheduleWelcomeIfEnabled } from "@/lib/welcomeReengagement";
import { BENEFIT_OPTIONS, REGISTRATION_PLAN_OPTIONS } from "./studentPlans";
import { StudentSheet } from "./StudentSheet";

const emptyForm = () => ({ name: "", phone: "", birth: "", city: "", cpf: "", plan: "Mensal",
  start: fmtDateISOSP(new Date()), due: "", benefit: "", previous: false, evaluation: "", welcome: true, messagesEnabled: true });
const showDate = (value: string) => value ? value.split("-").reverse().join("/") : "Não informado";
const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

export function CadastrarAlunoForm() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [review, setReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateError, setDuplicateError] = useState("");
  const [duplicates, setDuplicates] = useState<RegistrationDuplicate[]>([]);
  const [sharedPhoneConfirmed, setSharedPhoneConfirmed] = useState(false);
  const busy = useRef(false);
  const preflightBusy = useRef(false);
  const reviewVersion = useRef(0);
  const attempt = useRef<(TablesInsert<"students"> & { id: string }) | null>(null);
  const [success, setSuccess] = useState<Tables<"students"> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [welcomeStatus, setWelcomeStatus] = useState("Você optou por não preparar boas-vindas.");
  const [failure, setFailure] = useState("");
  const phone = formatPhoneBR(form.phone);
  const today = fmtDateISOSP(new Date());
  const change = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    reviewVersion.current += 1;
    setDuplicateError("");
    setDuplicates([]);
    setSharedPhoneConfirmed(false);
    setForm(current => ({ ...current, [key]: value }));
  };
  const validate = () => {
    if (!form.name.trim()) return "Informe o nome do aluno.";
    if (!phone.ok) return phone.reason || "Confira o WhatsApp.";
    if (form.cpf && !isValidCpf(form.cpf)) return "Confira os dígitos do CPF.";
    if (!form.start || form.start > today) return "Informe uma data de início até hoje.";
    if (form.birth && (form.birth > today || form.birth > form.start)) return "O nascimento deve ser anterior ou igual ao início na academia.";
    if (form.previous && (!form.evaluation || form.evaluation > today)) return "Informe uma data de avaliação anterior até hoje.";
    if (form.previous && form.birth && form.evaluation < form.birth) return "A avaliação não pode ser anterior ao nascimento.";
    return null;
  };
  const checkBeforeReview = async () => {
    if (preflightBusy.current) return;
    const error = validate();
    if (error) {
      toast({ title: "Confira o cadastro", description: error, variant: "destructive" });
      return;
    }
    preflightBusy.current = true;
    const version = ++reviewVersion.current;
    setCheckingDuplicates(true);
    setDuplicateError("");
    try {
      const found = await findRegistrationDuplicates(phone.number, unmaskCpf(form.cpf));
      if (version !== reviewVersion.current) return;
      setDuplicates(found);
      setSharedPhoneConfirmed(false);
      setReview(true);
    } catch {
      if (version === reviewVersion.current) {
        setDuplicateError("Não foi possível conferir se o aluno já existe. Verifique a conexão e tente novamente.");
      }
    } finally {
      preflightBusy.current = false;
      setCheckingDuplicates(false);
    }
  };
  const cpfMatches = duplicates.filter(student => student.matchesCpf);
  const phoneMatches = duplicates.filter(student => student.matchesPhone);
  const confirm = async () => {
    if (busy.current || cpfMatches.length > 0 || (phoneMatches.length > 0 && !sharedPhoneConfirmed)) return;
    busy.current = true; setLoading(true); setFailure("");
    attempt.current ??= {
      id: crypto.randomUUID(), name: form.name.trim(), phone: phone.number,
      birth_date: form.birth || null, city: form.city.trim() || null,
      cpf: unmaskCpf(form.cpf) || null, plan: form.plan,
      enrollment_date: form.start, benefit: form.benefit || null,
      payment_due_date: form.due || null, had_evaluation: form.previous,
      last_evaluation_date: form.previous ? form.evaluation : null,
      initial_evaluation_date: form.previous ? form.evaluation : null,
      messages_enabled: form.messagesEnabled,
    };
    try {
      const student = await saveStudentRegistration(attempt.current);
      setSuccess(student);
      if (form.welcome && form.messagesEnabled) {
        setWelcomeStatus("Conferindo a automação de boas-vindas…");
        const outcome = await scheduleWelcomeIfEnabled(student.id, student.name);
        setWelcomeStatus(outcome === "queued" ? "Boas-vindas preparadas na fila. Acompanhe a entrega em Mensagens."
          : outcome === "disabled" ? "Boas-vindas não preparadas: a automação está desativada."
            : "Aluno salvo. Não foi possível confirmar as boas-vindas; confira a fila de Mensagens antes de tentar enviar novamente.");
      }
      if (!form.messagesEnabled) setWelcomeStatus("Mensagens desativadas para este aluno. Nenhuma boas-vindas foi preparada.");
      for (const key of ["message-composer-data", "students", "students-evaluation-agenda", "students-summary", "dashboard-stats", "today-actions"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (error) {
      // Explicit database rejection is safe to edit; ambiguous failures retain the ID.
      if (error && typeof error === "object" && "code" in error &&
          ["23505", "23514", "22007", "42501"].includes(String(error.code))) attempt.current = null;
      setFailure(error && typeof error === "object" && "code" in error && error.code === "23505"
        ? "Já existe um aluno com estes dados. Volte e confira o CPF."
        : errorMessage(error, "Não foi possível confirmar o cadastro. Tente novamente com os mesmos dados."));
    } finally { setLoading(false); busy.current = false; }
  };
  const details = [
    ["Nome", form.name.trim()], ["WhatsApp", phone.formatted || form.phone],
    ["Início na academia", showDate(form.start)], ["Plano", form.plan],
    ["Próximo vencimento", showDate(form.due)], ["Benefício ou convênio", form.benefit || "Sem benefício"],
    ["Nascimento", showDate(form.birth)], ["Cidade", form.city || "Não informada"],
    ["CPF", form.cpf ? maskCpf(form.cpf) : "Não informado"],
    ["Avaliação anterior", form.previous ? `${showDate(form.evaluation)} · informada no cadastro` : "Nenhuma informada"],
    ["Preferência de contato", form.messagesEnabled ? "Mensagens permitidas" : "Mensagens desativadas"],
    ["Boas-vindas", form.welcome && form.messagesEnabled ? "Preparar se a automação estiver ativa" : "Não preparar"],
  ];
  const summary = (items: string[][]) => <dl className="grid gap-5 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium break-words">{value}</dd></div>)}</dl>;
  if (success) return <div className="space-y-6">
    <Card className="border-green-500/30"><CardHeader><CardTitle>{success.name} está cadastrado!</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground" role="status">{welcomeStatus}</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Próximo passo do atendimento</CardTitle><CardDescription>Abra a ficha ou agende a avaliação com este aluno já selecionado.</CardDescription></CardHeader><CardContent className="space-y-6">
      {summary(details.slice(0, 6))}<div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate(`/agendar-avaliacao?aluno=${success.id}`)}>Agendar avaliação</Button>
        <Button variant="outline" onClick={() => setSheetOpen(true)}>Abrir ficha do aluno</Button>
        <Button variant="outline" disabled={loading} onClick={() => { setSuccess(null); setForm(emptyForm()); setReview(false); attempt.current = null; setWelcomeStatus("Você optou por não preparar boas-vindas."); }}>Cadastrar outro</Button>
      </div></CardContent></Card><StudentSheet student={success} open={sheetOpen} onOpenChange={setSheetOpen} />
  </div>;
  return <div className="space-y-6">
    <nav aria-label="Etapas do cadastro" className="flex flex-wrap gap-4 text-sm text-muted-foreground">
      <span aria-current={!review ? "step" : undefined} className={!review ? "font-semibold text-primary" : ""}>1. Cadastro</span>
      <span aria-current={review ? "step" : undefined} className={review ? "font-semibold text-primary" : ""}>2. Conferência</span><span>3. Ficha do aluno</span>
    </nav>
    {review ? <Card><CardHeader><CardTitle>Confira antes de cadastrar</CardTitle><CardDescription>O cadastro só será salvo ao confirmar abaixo.</CardDescription></CardHeader><CardContent className="space-y-6">
      {summary(details)}
      {cpfMatches.length > 0 && <div role="alert" className="space-y-2 rounded-md border border-destructive p-4 text-sm"><p className="font-semibold text-destructive">CPF já cadastrado. Confira o aluno existente antes de continuar.</p><p>{cpfMatches.map(student => student.name).join(", ")}</p><Button variant="outline" onClick={() => navigate(`/alunos?busca=${encodeURIComponent(cpfMatches[0].name)}`)}>Ver aluno cadastrado</Button></div>}
      {phoneMatches.length > 0 && <div className="space-y-3 rounded-md border border-amber-500/60 p-4 text-sm"><p className="font-semibold">Este WhatsApp já aparece em outro cadastro.</p><p>{phoneMatches.map(student => student.name).join(", ")}</p><label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={sharedPhoneConfirmed} onChange={e => setSharedPhoneConfirmed(e.target.checked)} /><span>Confirmei que são alunos diferentes e que compartilham o número.</span></label></div>}
      {failure && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{failure} Ao tentar novamente, este cadastro será conferido sem criar uma segunda cópia.</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || !!attempt.current} onClick={() => setReview(false)}>Voltar e editar</Button><Button disabled={loading || cpfMatches.length > 0 || (phoneMatches.length > 0 && !sharedPhoneConfirmed)} onClick={() => void confirm()}>{loading ? "Confirmando cadastro…" : failure ? "Tentar confirmar novamente" : "Confirmar cadastro"}</Button></div>
    </CardContent></Card> : <form className="space-y-6" onSubmit={event => { event.preventDefault(); void checkBeforeReview(); }}>
      <Card><CardHeader><CardTitle>Quem é o aluno?</CardTitle><CardDescription>Comece pelas informações usadas no atendimento.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="nome">Nome completo *</Label><Input id="nome" required maxLength={100} autoComplete="name" value={form.name} onChange={e => change("name", e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="telefone">WhatsApp *</Label><Input id="telefone" type="tel" required maxLength={20} autoComplete="tel" placeholder="(43) 99999-0000" value={form.phone} onChange={e => change("phone", e.target.value)} /><p className={`text-xs ${form.phone && !phone.ok ? "text-destructive" : "text-muted-foreground"}`}>{form.phone ? phone.ok ? phone.formatted : phone.reason : "Informe DDD e número."}</p></div>
        </div>
        <details className="rounded-md border p-4"><summary className="cursor-pointer text-sm font-medium">Dados complementares · opcionais</summary><div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="nascimento">Data de nascimento</Label><Input id="nascimento" type="date" max={today} value={form.birth} onChange={e => change("birth", e.target.value)} /><p className="text-xs text-muted-foreground">Usada para os lembretes de aniversário.</p></div>
          <div className="space-y-2"><Label htmlFor="cidade">Cidade</Label><Input id="cidade" maxLength={100} value={form.city} onChange={e => change("city", e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="cpf">CPF</Label><Input id="cpf" inputMode="numeric" maxLength={14} value={maskCpf(form.cpf)} onChange={e => change("cpf", unmaskCpf(e.target.value))} /><p className="text-xs text-muted-foreground">Opcional. Um CPF já cadastrado será recusado.</p></div>
        </div></details>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Matrícula e vencimento</CardTitle><CardDescription>O início na academia é diferente da data de cadastro no sistema.</CardDescription></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="inicio">Início na academia *</Label><Input id="inicio" type="date" required max={today} value={form.start} onChange={e => change("start", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="plano">Plano *</Label><select id="plano" className={selectClass} value={form.plan} onChange={e => change("plan", e.target.value)}>{REGISTRATION_PLAN_OPTIONS.map(plan => <option key={plan}>{plan}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="vencimento">Próximo vencimento</Label><Input id="vencimento" type="date" value={form.due} onChange={e => change("due", e.target.value)} /><p className="text-xs text-muted-foreground">Informe a data acordada. O plano não gera cobranças automaticamente.</p></div>
        <div className="space-y-2"><Label htmlFor="beneficio">Benefício ou convênio</Label><select id="beneficio" className={selectClass} value={form.benefit} onChange={e => change("benefit", e.target.value)}><option value="">Sem benefício</option>{BENEFIT_OPTIONS.map(benefit => <option key={benefit}>{benefit}</option>)}</select><p className="text-xs text-muted-foreground">Pode acompanhar qualquer duração de plano.</p></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Primeiro acompanhamento</CardTitle><CardDescription>Registre o histórico informado e escolha como receber o aluno.</CardDescription></CardHeader><CardContent className="space-y-5">
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={form.previous} onChange={e => change("previous", e.target.checked)} />O aluno já realizou avaliação antes deste cadastro</label>
        {form.previous && <div className="space-y-2 rounded-md border p-4"><Label htmlFor="avaliacao-anterior">Data da última avaliação *</Label><Input id="avaliacao-anterior" type="date" required max={today} min={form.birth || undefined} value={form.evaluation} onChange={e => change("evaluation", e.target.value)} /><p className="text-xs text-muted-foreground">Origem: informada no cadastro. Não cria um atendimento fictício no histórico.</p></div>}
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={form.messagesEnabled} onChange={e => change("messagesEnabled", e.target.checked)} /><span>Permitir mensagens pelo WhatsApp<span className="block mt-1 text-xs text-muted-foreground">Desmarque se o aluno não quiser receber mensagens. A matrícula e as avaliações continuam disponíveis.</span></span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={form.welcome && form.messagesEnabled} disabled={!form.messagesEnabled} onChange={e => change("welcome", e.target.checked)} /><span>Preparar uma mensagem de boas-vindas<span className="block mt-1 text-xs text-muted-foreground">Será colocada na fila se a automação estiver ativa. Desmarque para alunos antigos.</span></span></label>
      </CardContent></Card>{duplicateError && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{duplicateError}</p>}<Button type="submit" className="w-full h-12" disabled={checkingDuplicates}>{checkingDuplicates ? "Verificando cadastros existentes…" : "Conferir cadastro"}</Button>
    </form>}
  </div>;
}
