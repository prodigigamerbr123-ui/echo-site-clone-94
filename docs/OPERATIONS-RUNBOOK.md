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

Desde 14/10, o procedimento instalado gera cinco arquivos: `database.dump` (postgres), `pooler.dump` (_supabase), `roles.sql`, `runtime.tar.gz` e `database-config.tar.gz`, além de manifesto e marcador complete. Confere ambos os catálogos pg_restore e exige configurações montadas do pooler/Envoy no tar antes de concluir. Backups contêm segredos e dados pessoais; manter fora do Git.

Snapshots `20261014T231942Z` e `20261014T232726Z`: cinco arquivos cada, copiados para armazenamento privado no computador e SHA256 comparados. Timer ativo, último automático em 14/10 06:03:27 UTC, success/0. A cobertura nova passou em duas execuções manuais; observar a primeira automática. Retenção: 14 snapshots completos, não 14 dias; cópia externa independente ainda pendente.

## Restore

Restauração dos metadados do pooler demonstrada: `restore-metadata.py 20261014T231942Z` restaurou `_supabase` em PostgreSQL descartável com rede none, sem workers de aplicação e roles sem senhas copiadas. Contagens, migrações e hashes de usuários/tenants coincidiram; fixture removida. Script específico desta entrega, com caminhos e nomes fixos: inspecionar estado antes de reutilizar.

A recuperação integrada de banco principal, Auth, arquivos e funções continua pendente. Validar sem sobrescrever produção e medir RTO/RPO. Evidências: [pooler publicado](auditoria-2026-10-11/pooler-publicacao-2026-10-14.md).

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

Entrega mais recente: [pooler security1 e backup ampliado](auditoria-2026-10-11/pooler-publicacao-2026-10-14.md), 32 checks isolados e 12 pós-publicação. Imagem `1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6`, zero críticos/48 altos revisados, seis registros Hex residuais. Somente pooler recriado; dados e migrações preservados.

Segurança da infraestrutura posterior: `docs/auditoria-2026-10-11/storage-seguranca-2026-10-14.md`. Storage security2 publicado, zero críticos/altos na varredura, 25 médios, 31 checks de homologação e serviços conferidos. Backup `20261014T182248Z` com quatro arquivos e dois arquivos privados de release copiados/hashes comparados. Rollback de imagem/compose em `ops/supabase-self-hosted/storage-security/dependencies/release.py`; estado privado na VM. Não executar scripts de release anteriores contra a imagem nova.

Conferência mais recente: `docs/auditoria-2026-10-11/agenda-publicacao-2026-10-14.md`, com 306 testes, homologação integrada e publicação de `892bb88` pelo workflow `38611036898`, concluído com sucesso. Backup `20261014T175538Z`, quatro arquivos e SHA256 local/remoto conferidos. Dashboard, agenda e histórico conferidos por leitura em produção.

- Agenda/histórico: correções locais documentadas em `docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md`, com lint, tipos, build e 298 testes em 35 arquivos. Essa fotografia local foi superada pela publicação 892bb88 descrita acima.
- Runtime/segurança: relatórios em `docs/auditoria-2026-10-11/`; são evidências históricas.
- Restore: metadados do pooler comprovados neste bloco; recuperação integrada completa continua pendente.

## Referências operacionais verificadas em 14/10

- Produção: `/opt/workout-supabase`; banco `workout-supabase-db`.
- Homologação: `/opt/workout-stage-security-20261012`; banco `workout-stage-full-20261012-db`, gateway somente local na porta 18090. Conferir rede interna, ausência de provedores externos e jobs inativos antes de escrever fixtures.
- Backups: `/home/ubuntu/workout-backups`; procedimento fonte `ops/supabase-self-hosted/backup.py`. A execução usa root na VM e valida os catálogos dos dois dumps; copiar a pasta concluída para armazenamento privado independente e comparar SHA256 de `database.dump`, `pooler.dump`, `roles.sql`, `runtime.tar.gz` e `database-config.tar.gz`.
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

## Recuperar a imagem e reverter a entrega do pooler

A cópia privada `C:/Users/pejon/.codex/ssh-workout04/pooler-runtime-release-20261014/runtime-image.tar.gz` tem SHA256 `5caf1754046980f0f234d8dc56abbbbe6056af4f599e61f23ccf2c8a54b3d53e`; índice/manifest/config e 12 layers conferidos. Após comparar o hash e executar `docker load -i runtime-image.tar.gz`, conferir o ID e atribuir a tag:

```bash
docker tag sha256:1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6 workout-supavisor:2.9.12-security1
```

O compose publicado exige UID/GID 65534, read_only, cap_drop ALL, no-new-privileges, pids_limit 256, tmpfs /tmp e RELEASE_TMP /tmp/release. NODE_IP loopback foi validado apenas para um pooler; múltiplos nós exigem revisão. Restaurar apenas a imagem não reproduz todos os controles.

A release específica usa `/home/ubuntu/workout-pooler-runtime-release-20261014/release-runtime.py`, fases prepare/apply/rollback e estado privado. Antes de retorno, conferir que não houve alterações posteriores. `sudo python3 release-runtime.py rollback` verifica hash do compose e ID antigo, restaura o compose anterior, recria somente supavisor e verifica saúde; não restaura banco. Não foi necessário executá-lo. Scripts antigos do Storage/pooler não devem desfazer mudanças posteriores no compose. Inspeções privadas incluem credenciais; nunca copiá-las para Git.
