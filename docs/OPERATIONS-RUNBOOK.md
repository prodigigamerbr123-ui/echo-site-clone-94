# Runbook operacional

## Escopo

Este documento descreve procedimentos operacionais do Workout e separa operações comprovadas de procedimentos. O núcleo do backend foi restaurado de forma integrada em isolamento em 15/10; recuperação em host vazio e serviços externos ainda não foram demonstrados.

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

Primeiro automático com cobertura ampliada confirmado: `20261015T060345Z`, às 06:03:45 UTC (03:03:45 de Brasília). Cinco arquivos copiados para armazenamento privado no computador e SHA256 comparados; catálogos dos dois dumps e configurações obrigatórias válidos. Timer ativo, próximo ciclo previsto para 16/10.

Desde 15/10, o manifesto inclui `sha256` além dos tamanhos. A sincronização Windows instalada verifica identidade do snapshot, marcador complete, presença/tamanho e hash dos cinco arquivos antes de registrar sucesso. Para manifestos antigos, busca os hashes por SSH. Execução manual do procedimento instalado `20261015T161530Z` e sincronização pelo Windows PowerShell passaram. Falha deve impedir atualização de `last-sync.txt`; não tratar só a existência desse arquivo como evidência de backup recente. Retenção: 14 snapshots completos, não 14 dias; cópia externa independente e recuperação em host vazio continuam pendentes.

Ampliação posterior de 15/10: runtime.tar.gz inclui `volumes/deno-cache`, obtido do volume Docker identificado/validado, além do código. Snapshot `20261015T162649Z` copiado/hashes conferidos e restaurado sem downloads externos. Observar o primeiro ciclo automático com esse cache. O backup recusa mount inesperado; mudança de nome do projeto/volume exige revisão explícita do caminho.

## Restore

Restauração dos metadados do pooler demonstrada: `restore-metadata.py 20261014T231942Z` restaurou `_supabase` em PostgreSQL descartável com rede none, sem workers de aplicação e roles sem senhas copiadas. Contagens, migrações e hashes de usuários/tenants coincidiram; fixture removida. Script específico desta entrega, com caminhos e nomes fixos: inspecionar estado antes de reutilizar.

Recuperação integrada aprovada em 15/10: `restore-integrated.py 20261015T162649Z 5`, 39 checks, banco principal completo + `_supabase`, Auth, REST, Storage, funções e gateway em rede interna. Dados de backup, senha do usuário original, migrações e funções comparados; fixtures sintéticas validaram login, dashboard, execução de função, upload/download, reinício e refresh. O Storage original não tinha objetos; não alegar recuperação de anexos reais. Containers/rede/envs temporários removidos.

O procedimento requer imagens locais já disponíveis e os cinco arquivos de um snapshot completo com SHA256/cache Deno. Copiar os arquivos do armazenamento privado para a área de backups, conferir os hashes e IDs das imagens, revisar o script datado e escolher um número de tentativa ainda inexistente. Ele mantém cron desativado desde a partida e pg_net sem processar a cópia; nunca iniciar workers reais ou fornecer credenciais externas ao exercício. Logs e dados extraídos permanecem privados.

Medição: 20,42 segundos no ensaio com poucos dados e imagens prontas, excluindo limpeza final. Não é RTO de desastre completo; faltam host vazio, DNS/TLS, Realtime, processo do pooler e Evolution/provedores. Definir RTO/RPO com a academia. Evidências: [recuperação de 15/10](auditoria-2026-10-11/recuperacao-integrada-2026-10-15.md).

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

Entrega de 15/10: [Auth security1 e backups](auditoria-2026-10-11/auth-seguranca-2026-10-15.md), imagem `94a79d1a5e15…`, 42 checks isolados e 19 em produção repetidos após reinício. Sete sessões anteriores preservadas; sessão própria encerrada. Zero críticos, um alto de versão pgproto3 com correção local documentada, cinco baixos/um desconhecido. Backup pré `20261015T162021Z` e pós `20261015T162154Z`, cinco arquivos cada copiados/hashes conferidos; imagem exportada e sete blobs OCI verificados. Procedimento/retorno em `ops/supabase-self-hosted/auth-security/README.md`. SMTP e rotação global continuam pendentes.

Entrega mais recente: [PostgREST security1](auditoria-2026-10-11/postgrest-seguranca-2026-10-14.md), imagem `dc990d07c8ce…`, zero críticos/altos, 37 médios/quatro baixos. Mesmo binário 14.17, 41 checks isolados/17 em produção e reinício aprovado. Backup anterior `20261015T010314Z`, posterior `20261015T010534Z`, cinco arquivos cada copiados/hashes conferidos; imagem exportada e seis blobs OCI verificados fora da VM. Schemas/funções e contagens preservados.

Entrega posterior: [contas limitadas do pooler](auditoria-2026-10-11/pooler-permissoes-2026-10-14.md), 56 checks isolados/29 em produção e reinício comprovado. Backup anterior `20261015T000850Z`, posterior `20261015T001054Z`, cinco arquivos cada copiados/hashes conferidos. Os metadados posteriores também foram restaurados em isolamento. A imagem security1 não mudou; mudou a configuração de credenciais e permissões.

Entrega mais recente: [pooler security1 e backup ampliado](auditoria-2026-10-11/pooler-publicacao-2026-10-14.md), 32 checks isolados e 12 pós-publicação. Imagem `1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6`, zero críticos/48 altos revisados, seis registros Hex residuais. Somente pooler recriado; dados e migrações preservados.

Segurança da infraestrutura posterior: `docs/auditoria-2026-10-11/storage-seguranca-2026-10-14.md`. Storage security2 publicado, zero críticos/altos na varredura, 25 médios, 31 checks de homologação e serviços conferidos. Backup `20261014T182248Z` com quatro arquivos e dois arquivos privados de release copiados/hashes comparados. Rollback de imagem/compose em `ops/supabase-self-hosted/storage-security/dependencies/release.py`; estado privado na VM. Não executar scripts de release anteriores contra a imagem nova.

Conferência mais recente: `docs/auditoria-2026-10-11/agenda-publicacao-2026-10-14.md`, com 306 testes, homologação integrada e publicação de `892bb88` pelo workflow `38611036898`, concluído com sucesso. Backup `20261014T175538Z`, quatro arquivos e SHA256 local/remoto conferidos. Dashboard, agenda e histórico conferidos por leitura em produção.

- Agenda/histórico: correções locais documentadas em `docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md`, com lint, tipos, build e 298 testes em 35 arquivos. Essa fotografia local foi superada pela publicação 892bb88 descrita acima.
- Runtime/segurança: relatórios em `docs/auditoria-2026-10-11/`; são evidências históricas.
- Restore: núcleo integrado comprovado em 15/10 com 39 checks; recuperação de infraestrutura em host vazio e serviços externos ainda pendente.

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

## Operar o pooler com contas limitadas

O serviço persistente usa workout_pooler_meta em DATABASE_URL e a senha própria
de workout_pooler_manager em POSTGRES_PASSWORD. Não copiar novamente a senha
administrativa compartilhada para essas variáveis. O alias técnico do manager
agora é workout_pooler_manager; pgbouncer não é uma credencial válida através do
novo helper. O usuário/senha do site permanece o mesmo.

A configuração montada obtém POOLER_MANAGER_USER e cria o tenant com o helper
pgbouncer.workout_pooler_auth. A função recusa contas privilegiadas e sua execução
não é pública. As contas não possuem CREATE, ownership, privilégios administrativos
ou associação a outras roles. Não conceder permissões adicionais sem rever os
limites e repetir as validações.

O comando persistente não executa migrações. Para atualizar a versão:

1. Conferir backup, restauração, imagem e SQL das migrações pretendidas.
2. Executar o migrador da imagem revisada como tarefa administrativa temporária,
   com ambiente privado e sem expor senha no terminal ou no Git.
3. Revisar grants das novas tabelas: runtime precisa de DML, sem propriedade/CREATE;
   schema_migrations continua somente leitura. Não reaplicar a receita inteira
   indiscriminadamente: a função já existe e os nomes das roles são protegidos.
4. Iniciar o serviço com as contas limitadas; validar SQL, autorização e reinício.

A entrega atual foi executada por
`/home/ubuntu/workout-pooler-roles-release-20261014/release-database-roles.py`.
Seu rollback guardado verifica hashes atuais, restaura campos específicos de
credenciais/consulta, compose e bootstrap, recria somente supavisor e desabilita
as novas contas. Não foi necessário acioná-lo. Preservar as provas e inspecionar
mudanças posteriores antes de executá-lo. O rollback anterior de runtime/Storage
não corresponde à configuração atual e deve ser bloqueado por seus guardas.

Restaurar somente `_supabase` foi comprovado com
`restore-metadata.py 20261015T001054Z --scope roles`. Essa opção grava evidência
separada em `/home/ubuntu/workout-pooler-roles-restore-20261014`; não repetir sobre
provas existentes. O restore completo e a reconstituição do helper em postgres
continuam parte do exercício integrado pendente.

## PostgREST: versão publicada e retorno

A imagem atual é workout-postgrest:14.17-security1, ID
`sha256:dc990d07c8ce83f1e676959e37e55845b4337bdb2ad65c6079e9522a658edcf1`.
O compose aplica UID/GID 1000, read_only, cap_drop ALL, no-new-privileges e limite
256 PIDs. Mantém o host explícito e a porta administrativa para postgrest --ready;
não alterar os parâmetros funcionais para reproduzir somente o healthcheck.

A imagem exportada está no diretório privado local
`C:/Users/pejon/.codex/ssh-workout04/postgrest-release-20261014/runtime-image.tar.gz`.
Conferir SHA256 `c3d4cc58cfbc162d2e8e25230610f340b4f03919975701a0c66bdefedd762d63`
antes de docker load e atribuir a tag ao ID verificado:

```bash
docker tag sha256:dc990d07c8ce83f1e676959e37e55845b4337bdb2ad65c6079e9522a658edcf1 workout-postgrest:14.17-security1
```

O script privado em `/home/ubuntu/workout-postgrest-release-20261014/release.py`
executa prepare/apply/observe/rollback. Observe faz leituras e assina um JWT curto
para o admin existente; não substitui teste de login por senha. O rollback confere
hash atual e imagem anterior, restaura somente o compose anterior e recria rest,
sem restaurar banco. Não foi necessário acioná-lo. Após mudanças no compose,
reavaliar o retorno; scripts anteriores de pooler/Storage não correspondem à
configuração atual e seus guardas devem impedir a execução.

O build preserva o executável PostgREST e depende de pacotes APT resolvidos na
ocasião. Rebuild exige nova comparação do scanner e nova validação; preservar a
imagem testada para recuperação. O backup completo integrado e a preservação
externa de todas as imagens customizadas continuam pendentes.
