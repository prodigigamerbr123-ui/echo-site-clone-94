# Auth e backups — entrega de 15/10/2026

## Resultado

Auth publicado e saudável: `workout-auth:2.196.0-security1`, imagem
`sha256:94a79d1a5e153f771a1f2066e0f38672d33e75e971b8a0d9393b856f7d5e15cc`.
Somente Auth foi recriado; configurações efetivas dos demais serviços comparadas.
Frontend permanece na entrega 892bb88; este lote não exige publicação de UI.

**42 verificações isoladas e 19 em produção**, repetidas após reinício. Login
real autorizado realizado antes da troca; access/refresh dessa sessão continuaram
funcionando após a atualização e o reinício. Token emitido pelo Auth acessou o
dashboard real. Sete sessões anteriores preservadas; somente a sessão própria
da auditoria foi encerrada. Senhas, identidades, migrações, estrutura/funções dos
schemas e contagens de alunos/avaliações preservadas.

Os checks de login/refresh escrevem timestamps e registros de sessão do Auth.
Não foram feitas alterações nos cadastros da academia, envios de WhatsApp ou
chamadas pagas de IA. Troca de senha foi validada apenas com contas fictícias.

## Varredura comparável

| Imagem | Críticos | Altos | Médios | Baixos | Desconhecidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original Auth v2.196.0 | 0 | 30 | 21 | 18 | 8 |
| Security1 | 0 | 1 | 0 | 5 | 1 |

Comparação repetida após atualização da base Trivy: UpdatedAt
`2026-10-15T13:13:18Z`, DownloadedAt `2026-10-15T16:19:31Z`, NextUpdate
`2026-10-16T13:13:18Z`. A comparação anterior de 14/10 foi preservada. Os números
são ocorrências de pacotes, não provas de exploração ou cobertura completa.

O alto remanescente é **CVE-2026-32286**, em pgproto3/v2 v2.3.3: o tratamento de
comprimentos negativos de campos precisa de uma checagem de limites. O repositório
upstream está arquivado e não fornece uma versão v2 corrigida no advisory.
Aplicamos a checagem no vendor, preservando versão/metadados e registrando hashes
antes/depois. **Nenhuma supressão de scanner ou versão fictícia foi usada.**
O scanner continua reportando o pacote original; a correção local tem evidência
própria e precisa de manutenção. Cinco baixos e um desconhecido seguem abertos.

Fonte fixada no commit `0204331ca41a5b49f076b6fa3dc6c0d20b996590`, mesma versão
Auth v2.196.0. Go 1.26.9; x/crypto 0.57.0, x/net 0.60.0, x/mod 0.41.0 e gRPC
1.83.2, com 17 mudanças de módulos diretos/transitivos registradas. Runtime
Alpine atualizado, incluindo OpenSSL 3.5.9-r0. As migrações são byte-idênticas.
O executável foi recompilado; não alegar identidade binária com o fornecedor.

UID/GID 1000, rootfs read-only, capabilities removidas, no-new-privileges,
seccomp ativo e limite de 256 PIDs conferidos em execução. Imagem: 19.594.984 bytes.

## Evidência funcional e limites

Fixture: rede Docker interna, PostgreSQL temporário, sem portas publicadas,
usuários/senhas sintéticos, autoconfirmação local e nenhum provedor externo.
Cobertura: criação/login, upgrade com tokens existentes, refresh, rejeição de
credencial inválida, administração, alteração normal de senha/metadados, recusa
de campos privilegiados, logout local, isolamento entre usuários e reinício.
Controles de runtime e remoção dos recursos temporários também verificados.

Parser: 14 casos determinísticos aprovados após a correção; o mesmo conjunto
detectou falha antes dela. Fuzz limitado a 10 segundos executou 9.783 entradas.
Não é comprovação de ausência de todo defeito possível no parser.

Tentativas preservadas: conflitos de dependências (x/mod exigido em 0.41.0),
composição do Dockerfile e execução do fuzz fora do módulo principal. Fixtures
foram ajustadas para criar o papel postgres e exigir os contratos reais:
assinatura inválida retorna 403/bad_jwt e alteração de campos privilegiados
retorna 403/not_admin; a alteração normal foi testada separadamente. Isso não
representa falha encontrada nos dados de produção.

SMTP/recuperação de senha, OAuth, MFA, captcha, carga prolongada e rotação global
de credenciais não foram concluídos por este lote.

## Backups e retorno

- Pré-publicação: `20261015T162021Z`; pós-publicação: `20261015T162154Z`.
- Cinco arquivos em cada snapshot: database.dump, pooler.dump, roles.sql,
  runtime.tar.gz e database-config.tar.gz. Todos copiados e SHA256 conferidos.
- Antes de aplicar: oito arquivos privados conferidos fora da VM, incluindo
  backup, compose anterior, inspeção e imagem; sete blobs OCI e a relação
  index/manifest/config/layers verificados.
- Imagem exportada e evidência privada copiadas para
  `C:/Users/pejon/.codex/ssh-workout04/auth-release-20261015/`.
- Evidência: 317.622 bytes, SHA256
  `e005b10893f8f1c2e62a382bda31ee9261ea2f6821902fe18d4ebdd8fe44ba2e`.
- Rollback com guardas de hash do compose e ID anterior; recria somente Auth,
  sem restaurar o banco. Não foi necessário executá-lo. Alterações posteriores
  no compose devem bloquear este retorno datado.

## Backup automático e sincronização

Primeiro automático com a cobertura ampliada confirmado em 15/10 às
06:03:45 UTC (03:03:45 de Brasília), `20261015T060345Z`: dois catálogos válidos,
configurações obrigatórias presentes e cinco arquivos copiados/hashes conferidos.

Melhoria instalada: manifesto inclui SHA256 e a sincronização Windows valida
identidade, complete, tamanho e hash dos cinco arquivos antes de registrar
sucesso. Manifestos antigos usam hashes obtidos por SSH. Tanto o formato antigo
quanto o novo foram verificados com snapshots reais. Manual `20261015T161530Z`
e cópia executada pelo Windows PowerShell aprovados; pós-release também copiado.

Um harness adicional de falhas sintéticas foi bloqueado pela revisão automática
de execução, sem motivo específico detalhado. Esses testes não foram contados
como executados. A revisão de falhas do sincronizador permanece limitada à
inspeção do código; não alegar testes negativos completos.

Retenção segue em 14 snapshots completos. Cópia no computador não equivale a
armazenamento externo independente. Restauração integrada e RTO/RPO continuam
pendentes até exercício específico.

## Fontes e procedimento

- [Procedimento reproduzível](../../ops/supabase-self-hosted/auth-security/README.md).
- [Auth v2.196.0](https://github.com/supabase/auth/tree/v2.196.0).
- [Advisory pgproto3](https://github.com/advisories/GHSA-jqcq-xjh3-6g23).
