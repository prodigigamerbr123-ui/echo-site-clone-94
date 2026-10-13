# Revisão local das automações — 13/10/2026

Estado: alterações locais e validadas no staging da VM; produção sem implantação
nesta revisão.

A migration 20261013010000_automation_run_history.sql usa a assinatura
has_staff_role(text[]) da migration de autorização. O administrador autenticado
tem somente SELECT no histórico; service_role grava e ignora RLS. A criação da
configuração payment_overdue começa desativada e preserva escolhas existentes.

O índice parcial único permite apenas uma execução running. A função adquire
esse bloqueio antes de consultar configurações ou criar mensagens. Uma segunda
chamada retorna 202 com skipped=true. Não há expiração automática do bloqueio:
uma execução antiga ainda pode estar escrevendo no banco.

Se houver execução travada, o operador deve suspender novas chamadas, confirmar
que o worker anterior terminou ou pará-lo, revisar histórico e fila e somente
então marcar a execução específica como failed, com finished_at preenchido.
Não liberar o bloqueio apenas porque passaram 20 minutos. Esse prazo serve para
alertar, não para provar que o worker morreu. Não apagar a execução ou a fila.

Uma falha de finalização do histórico após os agendamentos deixa running e
retorna erro genérico; isso exige reconciliação operacional e bloqueia outra
execução. Falhas antes da conclusão podem deixar um subconjunto de mensagens
gravado: o histórico failed não significa rollback dos agendamentos. A proteção
de deduplicação existente continua necessária ao tentar novamente.

As respostas HTTP não expõem mensagens arbitrárias de exceção. A consulta de
configurações falha explicitamente em caso de erro. Alertas de fila usam margem
de 5 minutos para não tratar a espera normal do cron como incidente.

Verificações realizadas: 73 testes Vitest aprovados (incluindo execução da
migration no PGlite, permissões e exclusão de uma segunda execução running),
e deno check --no-lock aprovado para daily-automation. PGlite e a análise de
tipos Deno não substituem um teste da stack self-hosted na VM.

## Validação na VM

Executado verify-stage-automation.py contra o gateway exclusivo de staging
127.0.0.1:18090 e o banco workout-stage-full-20261012-db. A identidade SSH foi
validada com o arquivo de hosts conhecido usado pelo backup. A migration foi
aplicada somente no banco de staging, com recarga de schema do PostgREST.

Verificado: rede interna e ausência de credenciais de provedores no Edge de
staging, autenticação do cron recusando segredo inválido (401), execução
concorrente recusada (202, skipped=true), nenhum registro extra na recusa,
execução com todas as automações desligadas concluindo com inserted=0, histórico
success com finished_at preenchido e liberação do bloqueio. A quantidade de
itens da fila permaneceu igual. Nenhum worker de envio foi acionado.

O script restaurou as configurações e o arquivo anterior da função de staging
ao terminar. A tabela e o histórico da validação permanecem nesse banco de
teste. O resultado foi salvo na VM em automation-validation.json no diretório
do staging. Esta validação não cobre geração de mensagens com automações
habilitadas, grandes volumes, falhas de rede ou todas as telas autenticadas.

Ordem para implantação após validação em staging e backup confirmado:
migration, função daily-automation, frontend. Conferir migrations aplicadas,
primeira execução registrada, alertas e retenção do histórico. Não acionar
worker com WhatsApp real durante a validação. A ausência inicial de histórico
aparece como aviso até a primeira execução registrada.

## Geração e interface

Segunda rodada na VM: 1.005 alunos fictícios com aniversário no dia produziram
1.005 agendamentos pending. Uma segunda execução produziu zero, confirmando
paginação de alunos, pendências e histórico acima do limite REST de 1.000.
Com três alunos elegíveis para vencimento/atraso e limite conjunto de uma
mensagem, foi criada uma mensagem de vencimento e nenhuma cobrança adicional.
Nenhum histórico de envio foi criado e nenhum worker de envio foi acionado.
Os alunos e mensagens fictícios foram removidos, configurações e estados dos
alunos de staging foram restaurados. A produção não foi modificada.

Frontend local foi conectado ao staging por túnel SSH e conta temporária,
removida ao final. O atalho de agendamento exibiu os controles de horário e o
botão Agendar. Automações mostrou as datas reais das execuções de teste.
O menu mobile permanecia sobre a página após navegação: corrigido fechamento
ao clicar no link. A agenda tinha largura de conteúdo 434px em viewport de
390px: ajustados título, disposição dos botões e min-width do layout, passando
para 375px; no viewport de 1280px a largura foi 1265px (sem transbordamento).

Avisos de acessibilidade do menu mobile foram identificados e adicionados
SheetTitle/SheetDescription ocultos visualmente. Classes antigas de variáveis
CSS foram convertidas para var(...) no sidebar, gráficos e popovers para
compatibilidade com Tailwind 4. TypeScript e build passaram após esses ajustes;
os últimos ajustes de acessibilidade/variáveis ainda precisam de nova inspeção
visual. A conta de QA, aba temporária, Vite e túnel SSH foram encerrados.
