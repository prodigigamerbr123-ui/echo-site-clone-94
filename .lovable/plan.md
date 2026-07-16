## O que muda na tela de Automações

Cada card de automação passa a mostrar, além do toggle e dos parâmetros já existentes, um **seletor de mensagem pré-definida** para cada tipo de mensagem que ela dispara.

- Automações com 1 tipo (aniversário, boas-vindas, follow-up, reengajamento, reagendar, convite avaliação) → **1 seletor** por card.
- "Lembretes de avaliação agendada" → **3 seletores** (confirmação, véspera, no dia), pois envia 3 mensagens diferentes.

Cada seletor tem:
- Dropdown com todas as mensagens pré-definidas + opção **"+ Criar nova mensagem"** (abre modal, salva em `predefined_messages`, seleciona automaticamente).
- Botão **"Ver texto"** para pré-visualizar o conteúdo escolhido.
- Se nada for selecionado → usa as variações padrão que já existem hoje (comportamento atual preservado).

Placeholders suportados no texto pré-definido:
- `{nome}` → nome do aluno
- `{data}` e `{hora}` → só para lembretes de avaliação (dia/horário agendado)

## Onde a escolha é usada

- **No frontend** (funções em `src/lib/evaluationMessages.ts` e `src/lib/welcomeReengagement.ts`): quando uma avaliação é agendada / aluno cadastrado / marcado como faltou → usam o texto linkado se houver.
- **Na edge function `daily-automation`** (aniversário e convite de avaliação vencida): também consulta a mensagem linkada. **Isto exige tocar nessa edge function** — apenas para ler o template escolhido; a lógica de agendamento e o envio (Evolution) **não mudam**. `send-whatsapp` e `process-scheduled-messages` continuam intocados.

## Onde a escolha é salva

Sem migração de schema. Guardamos em `automation_settings.params.templates`, no formato:

```json
{ "templates": { "birthday": "uuid-da-msg", "evaluation_reminder": "uuid-da-msg" } }
```

Os `params` existentes (`days_overdue`, `daily_limit`, `days_after`) continuam funcionando lado a lado.

## Arquivos que serão alterados

- `src/pages/Automacoes.tsx` — UI dos seletores + modal "criar mensagem".
- `src/lib/evaluationMessages.ts` — aceita template opcional (com placeholders) por tipo.
- `src/lib/welcomeReengagement.ts` — idem para welcome/reengagement.
- `src/pages/AgendarAvaliacao.tsx`, `src/components/dashboard/TodayInbox.tsx`, `src/components/alunos/*` — passam o template resolvido para as helpers (busca `automation_settings` uma vez).
- `supabase/functions/daily-automation/index.ts` — lê `params.templates` e usa o texto linkado se existir (fallback = variação atual).

## Confirmação necessária

Você me disse antes para **não mexer nas edge functions**. Para que o link funcione também em **aniversário** e **convite de avaliação vencida** (que são gerados pela edge `daily-automation`), preciso editar essa função — só a parte de escolher o texto. Posso?

Se preferir manter a edge function intocada, o link vai funcionar em welcome / reengajamento / follow-up / reagendar / confirmação e lembretes de avaliação, mas aniversário e convite de avaliação continuarão usando as variações padrão.
