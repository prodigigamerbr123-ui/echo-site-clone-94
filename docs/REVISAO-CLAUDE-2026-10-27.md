# Revisão do avanço com a Claude — 27/10/2026

## Base e limites

**Continuação:** os achados P1, P2 (parâmetros de cobrança vencida) e P3 abaixo foram corrigidos e publicados em 27/10 com autorização do cliente; permanecem nesta seção como registro do diagnóstico original. Ver a seção mais recente do `handoff.md`: commit `e7eb7fa`, workflow `40553258706` aprovado e backup `20261027T174217Z` copiado e verificado. Foram aprovados 550 testes/80 arquivos, tipos, lint, build, alcance e Deno check. Funções instaladas e quatro assets públicos conferidos por hash; cron jobs reativados. Validação dos parâmetros de outras automações continua fora deste lote; próximo ciclo natural ainda não observado.

Revisão do histórico entre `a99d3a2` e `01cd7a0`, com foco nas alterações próprias da rodada de 26/10 e na integração do lote anterior. O commit `57108d8` incorporou o trabalho local de alunos, avaliações e mensagens; não representa trabalho inteiramente novo da Claude. No início desta revisão, apenas `.claude/` estava fora do Git, sem alterações rastreadas pendentes.

O handoff registra publicação do frontend, sete migrações no conjunto das duas entregas, funções Edge, backups e retomada dos cron jobs. Essas informações foram lidas no repositório; nesta revisão não houve acesso à VM, conferência de hashes remotos, consulta ao banco de produção ou inspeção visual do site. Não reaplicar migrações com base nas seções históricas de 18/10.

## Avanços encontrados

- Consolidação do lote anterior: matrícula, renovação, histórico de planos, preferência de contato, data real da avaliação, revisão de mensagens e tratamento de entregas incertas.
- Painel com três ações principais, pendências clicáveis e indicadores coloridos; menu começa pela rotina, com status do WhatsApp compartilhado com o banner e margens menores no celular.
- Indicador “Nunca avaliados” e seus filtros limitados aos alunos ativos; inativos fora dos destinatários por padrão e sem selo de vencimento.
- Recuperação de falha de importação após deploy: consulta o HTML publicado e tenta uma recarga por entrada de build diferente.
- Limite configurável de cobranças por vencimento; texto de atrasos acima de 30 dias simplificado.
- Baixa de falhas revisadas com autorização por perfil e exclusão de mensagens cujo despacho já começou.
- Remoção de configurações sem efeito e padrão único de 30 dias para reengajamento.
- Atualização do zod e scripts de publicação com estados de operação, backup e retorno de funções. Não foram executados nesta revisão.

## Achados para corrigir

### P1 — Limite de cobranças ignora entregas incertas reais

`supabase/functions/daily-automation/index.ts:438` busca apenas os estados definidos em `_shared/paymentOverdue.ts:18`. A lista inclui `uncertain`, mas o worker registra entrega incerta como `failed` com `dispatch_started_at` preenchido (`process-scheduled-messages/index.ts:95`).

Assim, três cobranças com resposta incerta podem contar como zero tentativas. Depois do intervalo mínimo, outra cobrança poderá ser programada para o mesmo vencimento, embora as anteriores possam ter chegado. Corrigir a consulta para contar também `failed` com despacho iniciado, mantendo falhas definitivas sem despacho fora da contagem. Cobrir a seleção real das linhas, não apenas o helper que soma linhas previamente filtradas.

### P2 — Parâmetros numéricos podem ser salvos sem validação de domínio

`AutomationCard.tsx:136` usa entrada numérica com `min=0`, mas salva por clique direto, sem validação de formulário ou dos parâmetros no hook. O motor converte o novo `max_attempts` com `Number()` e compara sem conferir inteiro/finito (`daily-automation/index.ts:430`).

Exemplo: limite 3,5 permite quatro tentativas; um valor textual inválido persistido produz NaN e faz a comparação de limite retornar sempre falso. A entrada com mínimo visual não assegura a regra. Definir limites por parâmetro, validar no salvamento e no consumo pelo motor, e informar configuração inválida com comportamento conservador. O problema de validação já existia nos demais parâmetros e passou a afetar também o novo limite.

### P3 — Baixa coletiva oferece mais IDs do que o servidor aceita

`ScheduledList.tsx:265` envia todas as falhas visíveis filtradas; a RPC recusa mais de 1.000 IDs (`20261027010000_dismiss_reviewed_failures.sql:14`). Com 1.001 falhas, o botão oferece uma operação que falha integralmente. Não afeta as 35 falhas históricas citadas no handoff, mas convém limitar explicitamente a seleção ou processar lotes com resultado parcial claro.

### Documentação de continuidade contém pendências ultrapassadas

A linha de pendências no topo do `handoff.md` ainda lista a divergência 20 × 30 dias, já corrigida no código e na seção imediatamente anterior. Seções históricas também dizem que o lote não foi publicado. Elas estão identificadas como históricas pela seção recente, mas não devem orientar uma nova publicação. O pedido anterior de cópia do projeto para a VM não foi comprovado nesta revisão; registros de publicação do aplicativo não comprovam que exista um checkout completo para continuar de outro computador.

## Verificação desta revisão

- 534 testes em 79 arquivos aprovados.
- TypeScript estrito e ESLint aprovados.
- Build de produção aprovado; maior chunk JavaScript reportado: aproximadamente 240 kB sem compressão.
- Alcance: 82 raízes, zero módulos de aplicação desconectados; primitivas de UI excluídas pela regra existente.
- Nenhuma alteração de código de aplicação, commit, publicação, envio WhatsApp ou chamada paga de IA nesta revisão.
- Testes e build precisaram executar fora do sandbox para acessar o cache nativo do SWC; os checks terminaram com sucesso.
- Auditoria de dependências online, ambiente remoto e temas/teclado no navegador não foram revalidados.

## Próximo passo recomendado

Corrigir primeiro a contagem das cobranças incertas e validar seus parâmetros, com testes dos casos acima. Depois alinhar o handoff e conferir o próximo ciclo diário sem disparos de teste para alunos reais. Destino externo independente de backup continua pendente segundo o histórico. Manter o escopo de academia pequena, login compartilhado e aprovação do usuário antes de publicar mudanças visuais.
