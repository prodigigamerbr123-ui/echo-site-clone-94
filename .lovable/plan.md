# Login real + RLS + Edge Functions protegidas

Vou implementar em 4 etapas na ordem. Após cada etapa, paro e te digo o que testar antes de seguir. Sem tela de cadastro público — contas criadas por você no painel do Supabase.

---

## Etapa 1 — Autenticação no frontend

**Arquivos novos:**
- `src/hooks/useAuth.tsx` — provider que ouve `onAuthStateChange` + `getSession()` inicial, expõe `{ user, session, loading, signOut }`.
- `src/pages/Login.tsx` — formulário e-mail/senha usando `supabase.auth.signInWithPassword`. Erro genérico "E-mail ou senha incorretos". Logo e tema iguais ao resto.
- `src/components/auth/ProtectedRoute.tsx` — envolve rotas privadas: `loading` → spinner centralizado; sem sessão → `<Navigate to="/login" replace />`.

**Editar:**
- `src/App.tsx` — envolver a árvore com `<AuthProvider>`; rota `/login` pública; todas as outras rotas passam por `<ProtectedRoute>`.
- `src/components/layout/AppHeader.tsx` — mostra e-mail do usuário e botão "Sair" (chama `signOut()` e redireciona para `/login`).

**Painel Supabase (instruções que vou te dar no final da etapa):**
- Authentication → Providers → Email: desligar "Enable Signups".
- Authentication → Users → Add user (Auto Confirm) para cada conta.

---

## Etapa 2 — RLS em todas as tabelas

Migração única cobrindo `students`, `scheduled_messages`, `messages`, `predefined_messages`, `evaluations`, `ai_conversations`, `ai_messages`, `automation_settings`:

1. `DROP POLICY` das policies "Allow all" atuais.
2. `REVOKE ALL ... FROM anon` em cada tabela.
3. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` + `GRANT ALL ... TO service_role`.
4. Uma policy `FOR ALL TO authenticated USING (true) WITH CHECK (true)` por tabela (dados compartilhados da academia).
5. `REVOKE EXECUTE ON FUNCTION claim_due_scheduled_messages, reset_stuck_scheduled_messages FROM anon, authenticated` (mantém para `service_role`, que é o default).

Realtime já respeita RLS — como `authenticated` tem SELECT, o `GlobalNotifier` continua recebendo eventos após login.

---

## Etapa 3 — Edge Functions protegidas

**Funções chamadas pelo frontend** (`ai-assistant`, `send-whatsapp`, `whatsapp-status`, `whatsapp-contacts`, `daily-briefing`):
- No topo do handler: ler `Authorization: Bearer …`, chamar `supabase.auth.getUser(token)`; sem usuário → 401 com CORS.
- Frontend não muda: `supabase.functions.invoke` já injeta o token.

**Funções chamadas pelo cron** (`process-scheduled-messages`, `daily-automation`):
- Ler `Deno.env.get("CRON_SECRET")`; comparar com header `x-cron-secret`; divergente → 401.
- **Segredo:** te instruo a criar `CRON_SECRET` em Edge Function Secrets (painel Supabase) com um valor forte que você mesmo escolhe.
- **SQL pronto** para você rodar no SQL Editor recriando os dois jobs com o header incluído:

```sql
-- Substitua COLE_AQUI_O_CRON_SECRET pelo mesmo valor salvo em Edge Function Secrets
select cron.unschedule('process-scheduled-messages-every-minute');
select cron.unschedule('daily-automation-morning');

select cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://guomwsidnwapizkprkmo.supabase.co/functions/v1/process-scheduled-messages',
    headers:='{"Content-Type":"application/json","x-cron-secret":"COLE_AQUI_O_CRON_SECRET"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

select cron.schedule(
  'daily-automation-morning',
  '0 11 * * *',
  $$
  select net.http_post(
    url:='https://guomwsidnwapizkprkmo.supabase.co/functions/v1/daily-automation',
    headers:='{"Content-Type":"application/json","x-cron-secret":"COLE_AQUI_O_CRON_SECRET"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

Ordem obrigatória: **primeiro** salvar `CRON_SECRET` no painel, **depois** rodar o SQL. Se inverter, o cron dá 401 até você salvar o segredo.

---

## Etapa 4 — Anti-duplicata de reengagement

Em `src/lib/welcomeReengagement.ts` → `scheduleReengagementIfEnabled`: antes do insert, `SELECT id FROM scheduled_messages WHERE student_id = ... AND message_type = 'reengagement' AND status = 'pending' LIMIT 1`. Se existir, retorna sem inserir.

---

## Ordem de execução

1. Etapa 1 (código) → você testa login.
2. Etapa 2 (migração RLS) → você testa dados protegidos.
3. Etapa 3 (código + segredo + SQL cron) → você testa mensagem agendada + briefing da manhã.
4. Etapa 4 (código) → você testa reativação de aluno.

Confirma para eu começar pela Etapa 1?
