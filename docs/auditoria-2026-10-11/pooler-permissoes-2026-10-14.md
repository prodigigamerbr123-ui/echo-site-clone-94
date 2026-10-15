# Pooler: credenciais e permissões separadas — 14/10/2026

## Entrega publicada

O pooler continua na imagem security1
`sha256:1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6`.
A alteração foi de configuração, credenciais e permissões, sem atualizar pacotes.
Container saudável após recriação e reinício deliberado; último início em
15/10 às 00:10:15 UTC, equivalente a 14/10 às 21:10:15 de Brasília.

Passaram **56 verificações isoladas** e **29 verificações em produção**, repetidas
após o reinício. Apenas o pooler foi alvo de recriação/reinício. Login compartilhado
da academia preservado; nenhum WhatsApp real ou chamada paga de IA foi usado.

## Problema encontrado e correção

A conexão dos metadados utilizava `supabase_admin`, superusuário. Além disso,
`POSTGRES_PASSWORD` carregava a mesma senha administrativa usada pela conta
`pgbouncer`. Trocar somente DATABASE_URL manteria esse segredo administrativo
no processo e nos dados que o próprio pooler consegue descriptografar.

Foram criadas duas contas com senhas fortes e independentes:

| Conta | Permissões concedidas |
| --- | --- |
| `workout_pooler_meta` | CONNECT em `_supabase`, USAGE em `_supavisor` e leitura/escrita nas tabelas de metadados; `schema_migrations` somente leitura. Sem propriedade do schema, CREATE ou permissões administrativas. |
| `workout_pooler_manager` | CONNECT em `postgres`, USAGE em `pgbouncer` e EXECUTE somente na nova função de busca de credenciais. Sem acesso aos metadados ou aos alunos. |

Ambas estão sem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS e sem
associação a outras roles. A senha administrativa compartilhada não aparece em
nenhuma variável do novo container. DATABASE_URL usa a conta de metadados;
POSTGRES_PASSWORD agora contém somente a senha da nova conta manager.

A credencial criptografada do manager foi atualizada pela implementação real
Ecto/Cloak, preservando o mecanismo AES-GCM e a chave de criptografia existente.
O usuário/alias técnico do manager mudou de `pgbouncer` para
`workout_pooler_manager`; as consultas de validação usam a nova identidade.
Isso não altera o usuário/senha do site. Não havia conexão TCP estabelecida nas
portas locais 5433/6543 antes da troca. Clientes externos inativos não foram
inventariados individualmente; qualquer uso futuro da credencial administrativa
antiga através deste pooler deve ser substituído por uma conta limitada própria.

## Busca de credenciais com limites

O tenant usa `pgbouncer.workout_pooler_auth(text)`, função SECURITY DEFINER de
propriedade administrativa, search_path fixo em pg_catalog e sem EXECUTE público.
Ela recusa superusuários, contas com privilégios administrativos/BYPASSRLS,
membros de roles privilegiadas ou nativas pg_*, a conta de metadados e a conta
legada `pgbouncer`. Permite a própria conta manager limitada para as conexões
SQL de verificação e demais contas comuns autorizadas pelo PostgreSQL.

A função antiga `pgbouncer.get_auth` foi preservada, mas a nova conta manager
não tem acesso a ela. A suíte comprovou a recusa de contas privilegiadas diretas
e por associação. Em produção, a nova função retornou zero linhas para
supabase_admin, postgres, pgbouncer e workout_pooler_meta.

As permissões efetivas recusaram leitura de `public.students` e `pg_authid` pelas
duas novas contas. Elas ainda podem conectar a bancos que concedem CONNECT a
PUBLIC; esta entrega limita permissões, não implementa isolamento de rede por
conta. A inspeção de funções SECURITY DEFINER públicas encontrou o trigger
`public.update_updated_at_column` e duas funções graphql sem USAGE de schema
para a conta manager legada; não constitui auditoria exaustiva de todas as funções.

## Migrações separadas da execução

A tentativa de iniciar o serviço limitado com `/app/bin/migrate` falhou na
fixture: Ecto tenta criar/verificar a tabela de migrações, exigindo CREATE no
schema. Não foi ampliada a permissão da conta para contornar essa exigência.

O comando persistente agora inicia o bootstrap do tenant e o servidor, sem
executar migrações. O histórico atual foi conferido antes/depois e o usuário
de runtime não pode apagá-lo nem criar tabelas. Atualizações futuras precisam
executar migrações em etapa administrativa temporária e revisar os grants de
novas tabelas antes de iniciar o serviço limitado. Não conceder CREATE ou
propriedade do schema à conta persistente para fazer uma atualização passar.

## Evidência de validação e publicação

- A fixture usa rede Docker interna, PostgreSQL temporário, senhas sintéticas e
  nenhuma porta publicada. Começa pela imagem anterior para gerar os metadados.
- Abrange autenticação, SQL session/transaction, commit/rollback, prepared
  statements, concorrência, senha incorreta, autorização JIT, CRLF, controles do
  container, credenciais independentes, permissões negativas e reinício.
- As tentativas anteriores foram preservadas: colisão de listeners ao iniciar a
  aplicação completa para editar credenciais; exigência de DDL no migrador; e
  incompatibilidade do alias antigo com a nova identidade de banco. A solução
  edita credenciais iniciando apenas Repo/Vault, separa migrações e usa o novo
  alias técnico. A suíte final passou e removeu containers, rede e arquivo secreto.
- Produção: SQL nos dois modos, Auth/Storage, recusa de alunos anônimos, contas
  limitadas, ausência da senha administrativa no ambiente, conexões de metadados
  sob a conta nova e nenhuma conexão supavisor_meta como supabase_admin.
- Três alunos, um usuário Auth, dois crons ativos e um usuário/tenant do pooler
  foram preservados. As credenciais e a consulta do tenant mudaram de propósito;
  não declarar igualdade dos hashes desses campos com a configuração antiga.

## Backup, retorno e limites

Backup anterior: **20261015T000850Z**, cinco arquivos copiados para o computador
e hashes calculados independentemente. Também foram copiados e conferidos o
compose, o bootstrap e os registros de metadados anteriores: oito arquivos no
total antes da alteração. Todos contêm ou podem conter segredos; fora do Git.

Backup posterior: **20261015T001054Z**, mais cinco arquivos copiados e hashes
comparados. O dump `_supabase` desta configuração foi restaurado em PostgreSQL
isolado com rede none, sem workers e com roles criadas sem senhas copiadas.
Usuário/tenant, histórico e hashes completos das linhas coincidiram com produção;
fixture removida. Hash do dump:
`29b76512e4cb18e350c0651513fe996220533be17b3c01078be8cbb6f38228f9`.
Esse exercício não restaura o helper do banco principal nem comprova recuperação
integrada da aplicação; a função de autenticação foi validada separadamente na
fixture e na configuração publicada.

O pacote privado `evidence.tar.gz` foi copiado e conferido: 31.047 bytes,
SHA256 `665a3ec1add4f6649f49b6fd8301ae15cda6906f39246e376158f378fffca046`.
Inclui configurações, provas, logs das tentativas e receita executada, com dados
sensíveis; não publicar. A imagem é a mesma já exportada na entrega anterior.

`release-database-roles.py` exige os 56 checks e os hashes independentes, confere
o compose/bootstrap anterior, a imagem, o inventário e a ausência de clientes
conectados. Confere que a configuração efetiva dos outros serviços não mudou.
Em falha, restaura os campos anteriores de credenciais/consulta e os arquivos,
recria somente o pooler, verifica saúde e desabilita as novas contas.
O retorno não exigiu nem executou restauração do banco completo e não foi
necessário acioná-lo. Os guardas de hash impedem reutilizá-lo após outra alteração.

Diretórios privados: `/home/ubuntu/workout-pooler-roles-20261014`,
`/home/ubuntu/workout-pooler-roles-release-20261014` e cópia local em
`C:/Users/pejon/.codex/ssh-workout04/pooler-roles-release-20261014/`.
As receitas SQL/código versionadas não contêm os valores das credenciais.

Os zero críticos/48 altos de sistema operacional e seis registros Hex da
[entrega de runtime](pooler-publicacao-2026-10-14.md) continuam em aberto.
Não houve nova varredura de todas as imagens neste lote. A conta supabase_admin
continua administrativa para os outros serviços; reduzir seu uso global e
rotacionar segredos expostos exige coordenação separada. Recuperação completa
do Workout/Auth/arquivos/funções, armazenamento externo e demais containers
continuam pendentes. A auditoria geral não está concluída.
