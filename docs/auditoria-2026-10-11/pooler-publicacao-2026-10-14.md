# Pooler publicado e backups ampliados — 14/10/2026

> Entrega posterior: a [separação de credenciais e redução de permissões](pooler-permissoes-2026-10-14.md) foi publicada, com 56 checks isolados/29 em produção. O uso de supabase_admin pelo pooler descrito abaixo é histórico; os alertas de pacotes continuam abertos.

## Estado publicado

**Publicado e saudável**: `workout-supavisor:2.9.12-security1`, imagem
`sha256:1f3562efb570cd78c131771e2ab64ca8db2c71f40d5dd5efe5d6dba976d5c2a6`.
Container iniciado em 14/10 às 23:26:33 UTC. Somente o pooler foi recriado.
O frontend e as outras configurações efetivas de serviços foram preservados.

Passaram 32 verificações isoladas e 12 verificações após a publicação,
incluindo conexões SQL nos modos session/transaction, Auth, Storage e recusa
de leitura anônima de alunos. HTTPS externo: frontend, Auth e Storage 200;
consulta anônima de alunos 401. Os cabeçalhos de Origin, User-Agent e chave
pública utilizados estão descritos no procedimento; não atribuir a resposta
401 exclusivamente ao RLS.

Antes/depois: três alunos, um usuário Auth, dois crons ativos, um usuário e
um tenant do pooler. Histórico de migrações e hash dos usuários criptografados
do pooler permaneceram iguais. Nenhuma nova migração foi aplicada. Não foram
disparadas mensagens reais nem chamadas pagas de IA por este procedimento.

## Controles efetivos

- UID/GID 65534:65534; ausência de arquivos setuid/setgid conferida na imagem.
- Root filesystem somente para leitura; escrita em `/app` recusada no teste.
- Todas as capabilities removidas; CapEff zero, NoNewPrivs 1 e Seccomp 2.
- Limite de 256 PIDs; `/tmp` em tmpfs de 128 MiB, noexec/nosuid/nodev.
- Arquivos temporários da release em `/tmp/release`; configuração montada
  somente para leitura. O arquivo de código pooler.exs já tinha modo 0644.

Os controles de execução ficam no compose; usar apenas a imagem não reproduz
o conjunto completo. NODE_IP em loopback foi validado para a instalação atual
com **um pooler**. Uma futura configuração com múltiplos nós precisa de endereço
de distribuição próprio e nova validação.

As nove bibliotecas corrigidas e Finch são as versões do relatório
[pooler-dependencias-2026-10-14.md](pooler-dependencias-2026-10-14.md).
Não foram alterados pacotes ou seus metadados no lote de runtime: foram
retirados bits de privilégio dos executáveis e configurado o usuário sem root.
Os avisos de pacotes continuam registrados.

## Triagem dos alertas residuais

O scanner mantém **zero críticos e 48 ocorrências altas**, correspondentes
a **10 CVEs distintos** nesta imagem. A imagem anterior tinha 26 críticos e
731 altos no mesmo snapshot Trivy. A base continua com UpdatedAt de 14/10 às
13:10:32 UTC; não se trata de uma varredura nova dos demais containers.

Os relatórios anteriores registravam bloqueio por análise pendente. Neste
lote a decisão de publicação considerou as condições dos avisos, componentes
instalados, controles efetivos, compatibilidade e retorno. O verificador
funcional mantém `image_scan_clear=false`; a release exige a lista exata de
dez CVEs revisados, ausência de novos críticos, os 32 checks e as provas de
backup/restauração. Não há supressão global nem declaração de risco zero.

| Família/CVEs | Ocorrências | Evidência e tratamento |
| --- | ---: | --- |
| util-linux: CVE-2026-76642, 78408, 78409 e 78410 | 36 | Problemas de operações privilegiadas de montagem/namespaces. Runtime sem root, SUID/SGID, capabilities ou ganho de privilégios; filesystem somente para leitura. Não houve teste de exploração e as correções de pacote continuam pendentes. |
| curl: CVE-2026-12064 e CVE-2026-8458 | 4 | Exigem SCP/SFTP com protocolo padrão ou reutilização de conexão Negotiate. Healthcheck usa uma URL HTTP literal de loopback, sem essas opções. Não foram encontradas chamadas curl no código lib do Supavisor. O projeto curl classifica ambos como Low; o resultado High do scanner foi mantido. |
| ACL: CVE-2026-54369 | 1 | Exige operações ACL por um chamador privilegiado sobre caminhos controlados. UID sem privilégios e rootfs somente para leitura reduzem essa condição. Não equivale a corrigir libacl ou provar todos os seus usos. |
| ncurses: CVE-2025-69720 | 4 | O componente descrito é a ferramenta infocmp, que permanece instalada. Serviço sem TTY; caminho de entrada não identificado na revisão. Manter acompanhamento e avaliar retirada do utilitário, sem presumir que todas as bibliotecas ncurses tenham o mesmo caminho vulnerável. |
| systemd: CVE-2026-16742 | 2 | Aviso específico de systemd-homed. Binário ausente na imagem; presença de libsystemd/libudev não demonstra a presença desse serviço. |
| Perl: CVE-2026-9538 | 1 | Aviso de Archive::Tar. O módulo não pode ser carregado na imagem, que contém somente perl-base. Não foi executado um payload de negação de serviço. |

As constatações reduzem o alcance observado; não substituem atualizações de
bibliotecas, revisão de todos os caminhos nem auditoria do kernel/host.
As portas publicadas continuam em 127.0.0.1:5433/6543. Nenhuma referência ao
pooler foi encontrada nas variáveis dos outros containers inventariados; isso
não prova ausência de clientes ou de exposição por túneis. A troca verificou
ausência de conexões TCP estabelecidas nessas portas antes de recriar o serviço.

## Decimal e privilégios do banco

Continuam seis registros OSV em quatro pacotes: Cloak, cloak_ecto, Cowlib e
Decimal, com as condições registradas no relatório anterior. Decimal tem três
registros referentes a dois CVEs. A série 2.4 oferece mitigações opt-in, mas
permanece afetada no catálogo consultado; não foi tratada como correção completa.
Os defaults de segurança completos e as correções de round exigem versões da
série 3, incompatíveis com a exigência Decimal ~>1.5 ou ~>2.0 do Postgrex fixado.

Não foram encontradas chamadas Decimal ou campos `:decimal` no código lib do
Supavisor, nem colunas numeric no schema de metadados em produção. Isso não
exclui caminhos indiretos de bibliotecas; a correção compatível continua aberta.
Não foram executados payloads capazes de esgotar a memória do processo.

O papel `supabase_admin` ainda é superusuário no PostgreSQL; `postgres` e
`pgbouncer` não são. A execução sem root no container não reduz os privilégios
de conexão ao banco. Revisar a conta de metadados e a rotação coordenada de
segredos permanece necessário. O login compartilhado da aplicação foi preservado.

## Backup e restauração comprovados

Foi identificada e corrigida uma lacuna no backup instalado: o dump anterior
cobria `postgres`, mas não `_supabase`, e o tar de runtime não incluía as
configurações montadas do pooler e do Envoy.

O procedimento agora produz cinco arquivos: `database.dump`, `pooler.dump`,
`roles.sql`, `runtime.tar.gz` e `database-config.tar.gz`. Valida os dois catálogos
pg_restore e exige os arquivos de pooler/Envoy dentro do tar antes de marcar o
snapshot como completo. Segredos permanecem nos arquivos privados, fora do Git.

Backup anterior à troca: **20261014T231942Z**. Seus cinco arquivos foram
copiados e tiveram SHA256 calculado independentemente no computador. O dump
de `_supabase` foi restaurado em PostgreSQL descartável com rede `none` e sem
workers de aplicação. Roles foram criadas sem copiar senhas de produção.
Contagens, migrações e hashes das linhas de usuários/tenants coincidiram com a
leitura de produção. O container de teste foi removido.

O teste de upgrade separado iniciou a **imagem antiga**, criou metadados com
credenciais descartáveis e a substituiu pela nova: os usuários criptografados e
o histórico foram preservados. As 32 verificações também cobriram autorização
JIT, recusa de CRLF em cabeçalhos, concorrência e reinício.

Backup da configuração já publicada: **20261014T232726Z**, outros cinco arquivos
copiados e conferidos. A restauração testada foi do banco de metadados do
pooler; a recuperação integrada de banco principal, Auth, arquivos e funções
continua pendente. Não foi medido RTO/RPO do sistema completo.

Timer ativo: última execução automática em 14/10 às 06:03:27 UTC, status success/0;
próxima prevista para 15/10 às 06:03:41 UTC. A nova cobertura foi validada pelas
duas execuções manuais; a primeira execução automática com essa cobertura ainda
precisa ser observada. A retenção atual é de 14 snapshots completos, não 14 dias.

## Imagem preservada, retorno e evidências

A imagem publicada foi exportada para fora da VM: `runtime-image.tar.gz`,
69.495.860 bytes, SHA256
`5caf1754046980f0f234d8dc56abbbbe6056af4f599e61f23ccf2c8a54b3d53e`.
Além da comparação de hash, o índice OCI, manifest, configuração e 12 layers
foram conferidos: 14 blobs com digests válidos. Após `docker load`, atribuir a
tag `workout-supavisor:2.9.12-security1` ao ID verificado antes de usar o compose.

Foram conferidos oito arquivos privados antes da troca: cinco de backup,
compose/inspeção anteriores e imagem exportada. O backup posterior acrescenta
mais cinco. Isso não substitui uma cópia externa independente do computador
local nem preserva automaticamente as imagens customizadas dos outros serviços.

`release-runtime.py` conserva o compose e a imagem anterior e faz rollback
automático se falharem os checks pós-troca. O rollback manual verifica o hash do
compose atual e a identidade da imagem antiga; não precisa restaurar banco.
Não foi necessário acioná-lo. Mudanças posteriores no compose exigem revisão
antes de reutilizar esse procedimento.

Evidências privadas: `/home/ubuntu/workout-pooler-runtime-20261014` e
`/home/ubuntu/workout-pooler-runtime-release-20261014`. Cópia local em
`C:/Users/pejon/.codex/ssh-workout04/pooler-runtime-release-20261014/`.
O pacote `evidence.tar.gz`, sem duplicar a imagem exportada, tem 187.544 bytes e
SHA256 independente
`e7a72f2cd6690087660531f6de8c18b01acce5b5d9b76111484a1aa779686fff`.
Inclui inspeções com credenciais: manter fora do Git.

## Fontes primárias da triagem

- Debian util-linux: [76642](https://security-tracker.debian.org/tracker/CVE-2026-76642), [78408](https://security-tracker.debian.org/tracker/CVE-2026-78408), [78409](https://security-tracker.debian.org/tracker/CVE-2026-78409), [78410](https://security-tracker.debian.org/tracker/CVE-2026-78410).
- curl: [SCP/SFTP](https://curl.se/docs/CVE-2026-12064.html), [Negotiate/reuso](https://curl.se/docs/CVE-2026-8458.html).
- Debian: [ACL](https://security-tracker.debian.org/tracker/CVE-2026-54369), [infocmp](https://security-tracker.debian.org/tracker/CVE-2025-69720), [systemd-homed](https://security-tracker.debian.org/tracker/CVE-2026-16742), [Archive::Tar](https://security-tracker.debian.org/tracker/CVE-2026-9538).
- Decimal: [expoentes](https://github.com/ericmj/decimal/security/advisories/GHSA-rhv4-8758-jx7v), [round](https://github.com/ericmj/decimal/security/advisories/GHSA-6c27-994x-c52f).
