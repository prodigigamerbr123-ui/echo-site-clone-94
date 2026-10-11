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

Antes da cópia final, os crons antigos foram pausados e as gravações em tabelas
públicas bloqueadas por `workout_migration_read_only` no projeto cloud. Isso evita
que uma página antiga continue alterando a cópia antiga. O cloud fica preservado
para consulta e recuperação; sua cópia não deve executar envios simultâneos.

Frontend usa `.github/workout-backend.env`, contendo apenas URL e chave anon
públicas. Nunca coloque chaves `service_role` ou Gemini nesse arquivo. A chave
anon identifica a aplicação; acesso aos dados depende de autenticação e RLS.
No desenvolvimento, copie esses dois valores para seu `.env` local.

As funções são instaladas em `volumes/functions`. A IA aceita `GEMINI_API_KEY`
e `GEMINI_MODEL`, usando a API oficial do Google. Sem Gemini configurado, o código
continua aceitando `LOVABLE_API_KEY` no ambiente anterior.

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
