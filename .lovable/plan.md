
# Automações configuráveis — 3 etapas

Objetivo: dar ao dono da academia uma tela onde ele liga, desliga e ajusta cada automação, e fazer o motor + fluxos do app respeitarem essas configurações.

---

## Etapa 1 — Tabela `automation_settings`

Migração cria a tabela e faz o seed com 7 chaves:

| key | enabled | params |
|---|---|---|
| `evaluation_invite` | true | `{"days_overdue": 90, "daily_limit": 60}` |
| `birthday` | true | `{}` |
| `evaluation_reminders` | true | `{}` |
| `evaluation_followup` | true | `{"days_after": 7}` |
| `no_show_reschedule` | true | `{}` |
| `welcome_message` | false | `{}` |
| `reengagement` | false | `{"days_after": 20}` |

Estrutura: `key text pk`, `enabled boolean`, `params jsonb`, `updated_at`. RLS ligada com política aberta (padrão do projeto atual). GRANTs para `anon`, `authenticated` e `service_role` (leitura pelo motor via service_role, leitura/escrita pelo app).

**Testar:** abrir SQL editor e rodar `select * from automation_settings` — devem aparecer as 7 linhas com os defaults.

---

## Etapa 2 — Motor e fluxos leem as configurações

### 2.1 `daily-automation` (edge function)
No início da execução, carrega as 7 linhas em um mapa `settings[key]`.
- `evaluation_invite.enabled = false` → não gera lembretes de vencidos.
- Usa `params.days_overdue` no lugar do `90` fixo e `params.daily_limit` no lugar do `60` fixo.
- `birthday.enabled = false` → não gera aniversários.

### 2.2 Fluxo de avaliações
`supabase/functions/_shared/evaluations.ts` e `src/lib/evaluationMessages.ts` (mesmo código dos dois lados) ganham helpers `isEnabled(key)` e `getParam(key, name, default)` que leem `automation_settings` (frontend via `supabase.from`, backend via service role).
- Agendar avaliação: se `evaluation_reminders.enabled = false`, só cria o compromisso em `evaluations`, sem inserir as 3 mensagens (confirmação, véspera, dia).
- Marcar Realizada: se `evaluation_followup.enabled = false`, não agenda follow-up. Se ligada, usa `params.days_after` no lugar de `7`.
- Marcar Faltou: se `no_show_reschedule.enabled = false`, não agenda a mensagem de remarcação.

### 2.3 Nova automação `welcome_message`
Ao cadastrar aluno (`CadastrarAlunoForm`), se ligada, insere em `scheduled_messages`:
- `scheduled_for`: agora + 5 minutos
- `message_type`: `'welcome'`
- `content`: 1 de 3 variações convidando para a primeira avaliação física

### 2.4 Nova automação `reengagement`
Ao mudar aluno de `active` para `inactive` (em `EditarAlunoDialog`/`StudentSheet`), se ligada, insere `scheduled_messages`:
- `scheduled_for`: hoje + `params.days_after` dias, hora aleatória 09:00–12:00 BRT
- `message_type`: `'reengagement'`
- `content`: 1 de 3 variações "sentimos sua falta"

### 2.5 Exceção no processador
`process-scheduled-messages` hoje bloqueia mensagens automáticas para inativos. Adicionar `'reengagement'` à lista de exceções (junto com `'manual'`) — do contrário nunca sairia, já que o alvo é justamente o inativo.

### 2.6 Listas de tipos automáticos
Adicionar `'welcome'` e `'reengagement'` a `AUTO_EVAL_MESSAGE_TYPES` no frontend (`src/lib/evaluationMessages.ts`) e manter a lista equivalente no backend (`_shared/evaluations.ts`) idêntica, para que o badge "Automática" e a contagem no Dashboard incluam esses tipos.

**Testar:**
- Desligar `evaluation_reminders` via SQL e agendar uma avaliação: nenhuma linha em `scheduled_messages` para aquele aluno; só a linha em `evaluations`.
- Ligar `welcome_message` e cadastrar um aluno: ver `scheduled_messages` com `message_type='welcome'` para dali a 5 min.
- Ligar `reengagement`, mudar aluno pra inativo, adiantar `scheduled_for` para agora via SQL e rodar `process-scheduled-messages` — deve enviar (não bloquear).

---

## Etapa 3 — Página `/automacoes`

### 3.1 Menu
`AppSidebar`, grupo "Inteligência", abaixo de "Assistente IA": item **Automações** com ícone `Zap`.

### 3.2 Página
Layout: header + resumo do motor + grid de cards.

**Resumo do motor** (topo):
- Última execução: inferida pelo `MAX(created_at)` de `scheduled_messages` com `message_type` em `('evaluation_reminder','birthday')`.
- Próxima execução: texto fixo "Todo dia às 08:00 (Brasília)".
- Total de mensagens automáticas do mês: `count` de `scheduled_messages` do mês corrente com `message_type` em `AUTO_EVAL_MESSAGE_TYPES`.

**Um card por automação** (7 cards):
- Título amigável + descrição em português simples do quando dispara.
- `Switch` liga/desliga: `update` na hora + `toast.success("Automação atualizada")`.
- Parâmetros editáveis quando existirem, com `Input type="number"`, min 1, max razoável (ex.: 365 para dias, 500 para daily_limit), salvar no blur com toast.
- Contador dos últimos 30 dias: `count` de `scheduled_messages` filtrado pelo `message_type` correspondente.

Mapa key → message_type usado para contadores:
- `evaluation_invite` → `evaluation_reminder`
- `birthday` → `birthday`
- `evaluation_reminders` → `evaluation_confirmation`, `evaluation_reminder_day_before`, `evaluation_reminder_day_of` (soma os 3)
- `evaluation_followup` → `evaluation_followup`
- `no_show_reschedule` → `evaluation_reschedule`
- `welcome_message` → `welcome`
- `reengagement` → `reengagement`

### 3.3 Dashboard
No card "Motor de Automação" (`AutomationStatusCard`), adicionar botão/link "Configurar automações" → `/automacoes`.

**Testar:** abrir `/automacoes`, mexer nos switches e nos inputs, ver toast, atualizar a página e confirmar que persistiu; contadores devem bater com uma query manual em `scheduled_messages`.

---

## Notas técnicas

- `AUTO_EVAL_MESSAGE_TYPES` fica como fonte única no frontend, e uma cópia idêntica no `_shared/evaluations.ts` (Deno não importa do `src/`).
- Cache: helpers `isEnabled/getParam` no frontend leem via React Query com `staleTime: 30s` para não bater no banco a cada agendamento.
- Não mexer no cron nem no `process-scheduled-messages` além da exceção do 2.5.
- Sem alterações de UI fora do sidebar, dashboard (um link) e a nova página.
