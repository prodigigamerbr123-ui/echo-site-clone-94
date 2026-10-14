# Agenda e recuperação de páginas — 14/10/2026

## Agenda

A tela de avaliações e a IA agora consultam evaluation_schedule_conflicts, uma única operação de leitura no PostgreSQL. Ela aplica a mesma fronteira de dia em Brasília e a mesma janela aberta de 30 minutos usada pela transação de agendamento. O backend deixou de baixar uma lista potencialmente truncada; o frontend deixou de calcular a consulta usando o fuso do navegador.

A resposta contém somente a primeira duplicidade do aluno e o conflito mais próximo, com desempate determinístico. Na remarcação, a avaliação atual só pode ser excluída da consulta se pertencer ao aluno e continuar agendada. O parser compartilhado rejeita respostas incompletas em vez de presumir agenda vazia.

A consulta é uma prévia. O salvamento continua revalidando tudo na transação já existente, sob trava de agenda. A confirmação de conflito pelo usuário permanece disponível na tela. Horários exibidos na confirmação usam Brasília. Nenhuma avaliação ou mensagem existente foi alterada nesta entrega.

Migração nova: 20261014040000_evaluation_conflict_lookup.sql. Executável apenas por usuários autenticados com vínculo ativo de profissional. SECURITY DEFINER, search_path vazio e timezone UTC explícitos; consulta de agenda usa America/Sao_Paulo. Os índices de aluno, horário e status já existiam.

## Recuperação de páginas

As rotas carregadas sob demanda usam lazyPage e RouteErrorBoundary. Falhas de importação ou de renderização exibem uma tela de recuperação com recarregamento e retorno ao início, sem mostrar detalhes internos do erro. Uma navegação para outra rota limpa o estado de erro.

Não há recarregamento automático: formulários ainda não salvos poderiam ser perdidos, e uma falha persistente poderia criar um ciclo de reload. A interface informa essa consequência antes do recarregamento escolhido pelo usuário. A proteção vale para versões que já carregaram o novo código; uma aba com a versão anterior precisa ser recarregada uma vez. Falha no JavaScript inicial ou indisponibilidade total do site não é coberta por um boundary dentro da aplicação.

## Validação

- 274 testes em 32 arquivos. Casos novos: fronteiras exatas de 30 minutos, duplicidades, remarcação, conflito mais próximo, mais de 1500 avaliações, fuso de sessão, acesso revogado e conflito introduzido depois da consulta.
- Testes de React simulam módulo ausente, erro de renderização, recarregamento solicitado pelo usuário e navegação para outra rota; verificam ausência de reload automático e de detalhes internos na tela.
- Lint, tipos da aplicação, build, Deno check do consumidor da IA e suíte HTTP com dois testes principais/14 passos aprovados.
- Homologação com Auth/PostgREST/Edge reais, rede isolada e sem credenciais de WhatsApp/IA. Confirmados limite de registros, duplicidade, fronteiras, remarcação, revogação e trava final. Fixtures e função candidata removidos; arquivos, contagens e runtime anteriores restaurados. Um telefone duplicado nos dados fictícios da primeira execução foi corrigido antes da repetição aprovada.

## Servidor e retorno

Backup 20261014T134537Z: quatro arquivos verificados, com cópia local validada por SHA256. Release /opt/workout-releases/20261014-agenda-recovery, operada pelo script ops/supabase-self-hosted/release-agenda-recovery.py.

Aplicada a migração nova antes dos consumidores. O pacote contém 26 módulos; cinco handlers responderam 401 sem autenticação depois do restart. Os dois jobs foram retomados nos estados originais. Não houve envio real nem requisição paga de IA.

A fase rollback restaura runtime, gateway e flags anteriores dos jobs. A consulta adicional pode permanecer sem uso; não exige apagar dados. Para retorno do frontend, usar o commit anterior d084e04. Guardar o diário da release e os backups fora do Git.

## Continuação da auditoria

Este bloco não encerra a auditoria geral. Permanecem a revisão completa das datas exibidas na agenda/histórico para navegadores em outros fusos, a persistência de tentativas de criação de avaliações após falha de rede, a revisão de cache e a atualização consolidada dos demais itens do relatório.
