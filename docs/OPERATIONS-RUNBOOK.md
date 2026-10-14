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

Conferência mais recente: `docs/auditoria-2026-10-11/agenda-publicacao-2026-10-14.md`, com 306 testes e homologação integrada da agenda/histórico. Backup `20261014T175538Z`, quatro arquivos e SHA256 local/remoto conferidos. O relatório registra o estado final da publicação; não inferir publicação a partir de testes locais.

- Agenda/histórico: correções locais documentadas em `docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md`, com lint, tipos, build e 298 testes em 35 arquivos. Ainda sem publicação desse lote.
- Runtime/segurança: relatórios em `docs/auditoria-2026-10-11/`; são evidências históricas.
- Restore: exercício completo continua sem evidência de conclusão. Verificar artefatos privados e homologação antes de concluir que estão ausentes; não foram inspecionados neste bloco.

## Contingência

1. Interromper mudanças.
2. Preservar logs e evidências.
3. Avaliar rollback.
4. Registrar causa e correção.
