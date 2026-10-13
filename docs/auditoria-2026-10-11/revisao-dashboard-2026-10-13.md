# Revisão do dashboard e dos modelos — 13/10/2026

## Alterações

- `get_workout_dashboard()` reúne contagens e sugestões em um snapshot somente de leitura, com `SECURITY INVOKER`, RLS e permissão para profissionais autenticados. Nenhum argumento permite consultar outra identidade.
- Contagens feitas no PostgreSQL passam do limite de linhas da API. A lista de ações é completa; somente nomes de aniversariantes e a agenda usados no briefing têm amostra de 20 registros, identificada no contexto.
- Dias, semanas, meses e acompanhamentos usam o calendário de São Paulo, com início inclusivo e fim exclusivo. Mensalidades e aniversários consideram alunos ativos e os cartões explicitam isso.
- Sugestões de avaliação respeitam o prazo configurado (padrão 90 dias), a carência inicial de 14 dias, agendamentos futuros e o intervalo/máximo de convites. Envios pendentes, em processamento ou incertos bloqueiam novas sugestões. As sugestões são manuais: não habilitam automações nem reservam cota de envio.
- Frontend compartilha uma consulta entre estatísticas e sugestões, com chave por usuário/papel/dia, atualização periódica e invalidação após alterar automações. Falhas de consulta mostram erro e recuperação; métricas de mensagens sem permissão retornam indisponíveis, não zero.
- Envios do dia incluem somente `messages.status = sent`. Aceitação pelo provedor não confirma entrega/leitura.
- Navegador consulta o texto atual do modelo a cada resolução. Edge Functions reutilizam leituras somente por cliente criado dentro da requisição. Falhas não são cacheadas como modelos ausentes. Edição/exclusão vale para novos agendamentos; textos já na fila permanecem como foram confirmados.
- Placeholders compartilhados entre frontend/backend, inclusive `{dias}` e `{days}`. Nenhuma propriedade herdada vira placeholder.
- Briefing usa o mesmo snapshot, valida o contrato e a resposta do modelo, limita espera a 30 segundos e não devolve erros brutos do provedor.
- Arquivos alterados foram normalizados para LF; não foram alteradas regras de lint.

## Evidência anterior à publicação

- 116 testes Vitest aprovados, incluindo SQL com mais de mil alunos, limites de calendário, RLS, regras de convite, contratos e tela de falha.
- 2 testes Deno aprovados para cache de templates por requisição/identidade e falhas de consulta.
- TypeScript, build e checagem Deno dos três consumidores dos helpers aprovados. ESLint: zero erros e 15 avisos existentes de organização de exports.
- Staging: 26 verificações, 1.005 alunos fictícios, login e RPC real da stack isolada. Dados fictícios removidos, contagens anteriores e arquivos de runtime restaurados; função de leitura mantida no staging.
- Dashboard local conferido na UI, sem erros de console. Conta visual removida e servidores temporários encerrados.
- Nenhuma chamada paga à IA e nenhum envio real de WhatsApp durante esta revisão. A geração do texto pelo provedor não foi exercitada.

Este registro descreve preparação e staging. A publicação será registrada separadamente com commit, backup e verificações de produção.
