# Arquitetura dos agendamentos — 14/10/2026

## Entregue neste bloco

- Um planejador tipado em src/lib/messageSchedule.ts atende os dois compositores. Regras de horário, personalização, envio gradual e recorrência deixaram de ser copiadas nas telas.
- O formulário compacto reutiliza useMessageComposerData, com paginação, exclusão dos modelos automáticos, cache, carregamento e nova tentativa em caso de erro.
- Regras puras de avaliações e fuso ficam em supabase/functions/_shared/evaluationPolicy.ts e spTime.ts. Frontend e servidor importam a mesma implementação; acesso a banco e resolução de modelos permanecem nos adaptadores de cada ambiente.
- Datas impossíveis e horários fora de 00:00–23:59 são rejeitados antes de construir Date. O limite de 1000 caracteres também é conferido depois da personalização.
- Os compositores usam uma trava síncrona por formulário contra submissões simultâneas, inclusive antes da atualização do estado React.
- Recorrências continuam materializadas, com raízes independentes por aluno e deduplicação de datas sobrepostas. Não houve alteração de esquema, permissões ou requisito de administrador compartilhado.

## Validação

- 209 testes Vitest em 27 arquivos, incluindo 34 novos casos de calendário, fuso, personalização, recorrência e política das avaliações.
- Lint, TypeScript da aplicação, build e Deno check dos dois consumidores das avaliações aprovados.
- Suíte HTTP Deno: dois testes principais e 14 passos aprovados, sem serviços externos reais.
- Scanner de segredos: 349 arquivos, nenhum padrão detectado; isso não garante ausência absoluta de segredos.
- Pacote com 24 módulos validado na homologação isolada da VM. Novos módulos carregaram; quotas e autenticação preservadas; conta de teste removida e arquivos anteriores restaurados. Essa validação usa Auth/PostgREST reais, mas não executa conversas pagas nem entrega de WhatsApp.

## Publicação do servidor

Runtime publicado em 14/10/2026 com backup 20261014T125759Z. Quatro arquivos conferidos por tamanho, integridade dos arquivos compactados e leitura do catálogo do dump. A cópia local foi conferida por SHA256 contra a prova da VM.

Release: /opt/workout-releases/20261014-shared-scheduling. Script versionado: ops/supabase-self-hosted/release-shared-scheduling.py. Foram pausados os dois jobs, aguardada a ausência de entregas em andamento, aplicado o pacote e conferido retorno 401 dos cinco handlers sem credenciais. Gateway e jobs voltaram aos estados anteriores. Nenhuma migração SQL foi aplicada.

Rollback: executar a fase rollback do script da release na VM; ela restaura os arquivos anteriores, gateway e flags originais dos jobs. O frontend pode retornar ao commit anterior 2485233.

## Pendências explícitas

A arquitetura geral ainda está em andamento. O planejador do compositor é uma validação de interface, não uma fronteira de segurança. Ainda existem INSERTs autenticados na fila no frontend, nas boas-vindas/reativação e em caminhos da IA.

O próximo bloco deve criar uma operação transacional no servidor para enfileiramento: resolver destinatários cadastrados, validar intenção de agendamento, aplicar quota e guardar chave de idempotência vinculada ao conteúdo. Migrar todos os chamadores antes de retirar o INSERT direto. A trava de clique atual não impede duplicação após resposta de rede perdida ou atualização da página.

Também permanecem: eliminar a duplicação das consultas de conflitos da agenda, revisar paginação dos caminhos legados e recuperar automaticamente chunks antigos após publicações. Não marcar a auditoria ou a arquitetura inteira como concluídas por esta entrega.

## Frontend publicado e conferência visual

Commit de código: f6afc15. Workflow 38568031555 concluído com success:
https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38568031555

Após a conclusão do pipeline, a aba autenticada foi recarregada. O compositor de agendamento carregou alunos, modelos e controles de horário; a alternância para personalizado exibiu data, horário e recorrência. A agenda de avaliações também carregou seus dados e controles. Nenhum destinatário foi selecionado, nenhuma avaliação foi alterada e nenhum envio foi submetido. A aba foi devolvida ao Dashboard.

Os hashes dos 24 módulos em produção e as flags originais dos dois jobs foram conferidos novamente após a publicação. Este registro final altera apenas documentação.
