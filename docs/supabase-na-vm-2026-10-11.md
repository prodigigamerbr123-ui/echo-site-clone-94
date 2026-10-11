# Supabase próprio na VM — 11/10/2026

## Ambiente

- Stack separada em `/opt/workout-supabase`, Compose `workout-supabase`.
- Base oficial fixada em `self-hosted/v0.8.2`; imagens ARM64 verificadas.
- PostgreSQL 17, Auth, REST, Realtime, Storage e Edge Functions.
- API: `https://backend.workoutsaas.dpdns.org` pelo túnel Cloudflare existente.
- Gateway público permite somente as rotas das APIs. Studio não é publicado.
- Portas da VM: gateway `127.0.0.1:8000`, pooler `127.0.0.1:5433/6543`.
- Senhas e chaves privadas somente na VM, em arquivos com acesso restrito.
- Cadastro público desabilitado. Políticas RLS e permissões copiadas do projeto.

## Migração

Exportação oficial em três arquivos via Supabase CLI: roles, schema e data.
Contas, hashes de senha, tabelas, funções SQL, triggers e políticas são preservados.
Tabelas internas novas de Auth ausentes no destino foram omitidas somente quando
vazias; os arquivos originais permanecem nos backups. A restauração foi atômica.
As permissões de execução de todas as funções públicas foram comparadas com a
origem e reaplicadas: criar objetos como `supabase_admin` herda permissões padrão
diferentes de `postgres`. Permissões de tabelas, sequências e RLS também foram
reconciliadas. Os RPCs de envio permanecem exclusivos de `service_role`.

Na conferência final, os crons antigos foram pausados e as gravações em tabelas
públicas bloqueadas por `workout_migration_read_only` no projeto cloud. O conteúdo
de todas as tabelas da aplicação foi comparado novamente após esse bloqueio e
continuou igual nas duas bases. Isso evita
que uma página antiga continue alterando a cópia antiga. O cloud fica preservado
para consulta e recuperação; sua cópia não deve executar envios simultâneos.

Frontend usa `.github/workout-backend.env`, contendo apenas URL e chave anon
públicas. Nunca coloque chaves `service_role` ou Gemini nesse arquivo. A chave
anon identifica a aplicação; acesso aos dados depende de autenticação e RLS.
No desenvolvimento, copie esses dois valores para seu `.env` local.
O schema TypeScript canônico fica em `_shared/database.types.ts`; o frontend
reexporta seus tipos. Ao regenerar tipos, atualize esse arquivo compartilhado,
pois o worker na VM não tem acesso à pasta `src` do frontend.

As funções são instaladas em `volumes/functions`. A IA aceita `GEMINI_API_KEY`
e `GEMINI_MODEL`, usando a API oficial do Google. Sem Gemini configurado, o código
continua aceitando `LOVABLE_API_KEY` no ambiente anterior.

## Resultado da conferência

- Site publicado e login existente aceito pelo backend da VM.
- 3 alunos, 2 avaliações, 18 mensagens, 57 registros de fila e 23 templates.
- Dados das nove tabelas de negócio iguais por contagem e digest de conteúdo.
- Realtime habilitado para alunos, avaliações e fila, como no cloud.
- WhatsApp conectado. Worker cron respondeu HTTP 200 sem criar novos envios.
- Crons 13/14 do cloud inativos; crons 1/2 da VM ativos.
- RLS e permissões públicas reconciliadas com a origem; Studio externo HTTP 404.
- Chave Gemini aceita pela API de listagem de modelos do Google.
- Banco da VM em aproximadamente 12 MB após a restauração, sem o espaço
  acumulado no banco antigo. Isso não comprova a causa do consumo antigo.
- Build concluído. Permanecem avisos anteriores de tamanho do bundle/Browserslist.

## Operação

```sh
cd /opt/workout-supabase
sudo docker compose ps
sudo docker compose up -d --wait
sudo docker compose logs --tail 50 auth
```

Logs e backups podem conter dados pessoais; não copie seu conteúdo para issues
ou para o repositório público. Nunca execute `reset.sh`, `down -v` ou remova
`volumes/db/data` para atualizar serviços.

Backups: `ops/supabase-self-hosted/backup.py` salva banco, roles, configuração,
funções, arquivos e chaves de criptografia do banco. Conserva quatorze snapshots
completos em `/home/ubuntu/workout-backups`, com permissões restritas. O catálogo
do dump é lido após cada exportação; isso não substitui um ensaio de recuperação.
O timer Linux roda diariamente às 06:00 UTC. O computador Windows copia o último
snapshot diariamente às 08:00 locais, quando o usuário estiver conectado, pela
tarefa `Workout Supabase Backup Sync`. Se estiver desligado, a cópia aguarda sua
próxima disponibilidade. As cópias ficam na pasta protegida
`~/.codex/ssh-workout04/backups`, fora do OneDrive. O script está em
`ops/supabase-self-hosted/sync-backup.ps1`.

SMTP próprio não foi configurado: a aplicação atual usa login por senha e
WhatsApp. Recuperação de senha e outros e-mails exigem configurar um provedor
SMTP em `.env` antes de oferecer esses fluxos aos usuários.

## Recuperação e reversão

Uma restauração deve ser feita em uma stack isolada: repor roles, restaurar o
dump com suas permissões, repor arquivos/configuração e chaves de criptografia,
subir as mesmas versões e conferir a aplicação antes de redirecionar o site.
Nunca restaure diretamente sobre uma produção ativa.

Para voltar ao cloud após alterações na VM, é necessário sincronizar os dados
novos primeiro. Depois, pausar os envios na VM, remover os triggers e a função
`workout_migration_read_only` do cloud, reativar os dois crons antigos e publicar
as configurações anteriores do frontend. Não basta trocar a URL: isso perderia
as alterações feitas desde a migração.

Referências: [Docker oficial](https://supabase.com/docs/guides/self-hosting/docker),
[restauração do cloud](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[Gemini compatível com Chat Completions](https://ai.google.dev/gemini-api/docs/openai).
