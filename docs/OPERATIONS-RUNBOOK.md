# Runbook operacional

## Escopo

Este documento descreve procedimentos operacionais do Workout. Ele separa procedimentos documentados de operações comprovadas. Não há restore completo de produção comprovado neste repositório.

## Validação antes de publicação

```bash
npm ci
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test -- --run
npm run build
```

## Arquitetura operacional

- Frontend: React/Vite em `src/`.
- Backend: Supabase migrations e Edge Functions em `supabase/`.
- Operação self-hosted documentada em `ops/supabase-self-hosted/`.
- Evidências de auditoria em `docs/auditoria-2026-10-11/`.

## Backup

O procedimento documentado está em `ops/supabase-self-hosted/backup.py`.

Ele cria dump PostgreSQL, roles, runtime e manifesto de arquivos. Backups privados devem ficar fora do repositório. A última entrega documentada em `docs/auditoria-2026-10-11/agenda-recuperacao-2026-10-14.md` registra o backup `20261014T134537Z`, quatro arquivos e cópia local com hashes conferidos. Este bloco local não reinspecionou esses arquivos nem confirmou execução posterior do timer.

## Restore

Estado atual: não demonstrado.

Necessário: backup compatível, ambiente isolado, validação do dump e teste sem sobrescrever produção.

## Rollback

Antes de publicar:

- registrar versão anterior;
- preservar backup verificável;
- registrar migrations aplicadas;
- confirmar caminho de retorno.

## Segurança e observabilidade

Não armazenar segredos no Git. `.env.example` contém somente nomes de variáveis públicas.

Acompanhar erros frontend, Edge Functions, automações, fila de mensagens e agenda.

## Evidências atuais

Segurança da infraestrutura posterior: `docs/auditoria-2026-10-11/storage-seguranca-2026-10-14.md`. Storage security2 publicado, zero críticos/altos na varredura, 25 médios, 31 checks de homologação e serviços conferidos. Backup `20261014T182248Z` com quatro arquivos e dois arquivos privados de release copiados/hashes comparados. Rollback de imagem/compose em `ops/supabase-self-hosted/storage-security/dependencies/release.py`; estado privado na VM. Não executar scripts de release anteriores contra a imagem nova.

Conferência mais recente: `docs/auditoria-2026-10-11/agenda-publicacao-2026-10-14.md`, com 306 testes, homologação integrada e publicação de `892bb88` pelo workflow `38611036898`, concluído com sucesso. Backup `20261014T175538Z`, quatro arquivos e SHA256 local/remoto conferidos. Dashboard, agenda e histórico conferidos por leitura em produção.

- Agenda/histórico: correções locais documentadas em `docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md`, com lint, tipos, build e 298 testes em 35 arquivos. Ainda sem publicação desse lote.
- Runtime/segurança: relatórios em `docs/auditoria-2026-10-11/`; são evidências históricas.
- Restore: exercício completo continua sem evidência de conclusão. Verificar artefatos privados e homologação antes de concluir que estão ausentes; não foram inspecionados neste bloco.

## Referências operacionais verificadas em 14/10

- Produção: `/opt/workout-supabase`; banco `workout-supabase-db`.
- Homologação: `/opt/workout-stage-security-20261012`; banco `workout-stage-full-20261012-db`, gateway somente local na porta 18090. Conferir rede interna, ausência de provedores externos e jobs inativos antes de escrever fixtures.
- Backups: `/home/ubuntu/workout-backups`; procedimento fonte `ops/supabase-self-hosted/backup.py`. A execução usa root na VM e valida o catálogo do dump; copiar a pasta concluída para armazenamento privado independente e comparar SHA256 de `database.dump`, `roles.sql`, `runtime.tar.gz` e `database-config.tar.gz`.
- Fixture visual: `ops/supabase-self-hosted/agenda-visual-fixture.py`, com pacote temporário `/home/ubuntu/workout-agenda-ui-20261014` e a migração de consulta em `lookup.sql`. O script prepara e limpa apenas recursos de staging identificados no estado privado. Não rodar contra outra stack nem executar prepare sobre estado já existente sem inspeção.
- Frontend de homologação: Vite em `127.0.0.1:18091`, com URL/chave pública exclusivamente do gateway de testes via túnel. Nunca copiar service role para variável VITE. Encerrar a sessão descartável, remover fixtures, conferir contagens e parar apenas os processos temporários criados para a validação.
- Publicação do frontend: `.github/workflows/deploy-pages.yml`, disparado por push em main; confirmar o SHA e a conclusão do deploy. O pipeline executa scanner, auditoria npm, tipos, lint, testes e build usando `.github/workout-backend.env`.
- O frontend atual não exige nova migração ou publicação de Edge Functions. Para retorno, usar artefato/revisão anterior verificada; não restaurar o banco para desfazer somente a interface.
- Consulta operacional de 14/10 em `docs/auditoria-2026-10-11/conferencia-operacional-2026-10-14.md`: execução diária natural confirmada e jobs ativos. Leitura de cron deve omitir o campo command, que pode conter informação sensível.

## Resposta a incidentes

1. Interromper mudanças.
2. Preservar logs e evidências.
3. Avaliar rollback.
4. Registrar causa e correção.
