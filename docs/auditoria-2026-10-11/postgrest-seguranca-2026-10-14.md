# PostgREST: runtime corrigido e publicado — 14/10/2026

## Resultado publicado

**Publicado e saudável**: `workout-postgrest:14.17-security1`, imagem
`sha256:dc990d07c8ce83f1e676959e37e55845b4337bdb2ad65c6079e9522a658edcf1`.
Último início em 15/10 às 01:04:41 UTC, equivalente a 14/10 às 22:04:41 de Brasília.
Somente o serviço rest foi recriado e reiniciado deliberadamente; a configuração
efetiva dos demais serviços foi comparada e permaneceu igual.

Passaram **41 verificações isoladas e 17 verificações em produção**. As 17 foram
repetidas após reinício. Alunos, dashboard, Auth, Storage e pooler conferidos;
nenhum envio de WhatsApp, chamada paga de IA ou alteração de registros da
academia foi feito pelo procedimento de publicação.

## Comparação na mesma base do scanner

| Imagem | Críticos | Altos | Médios | Baixos | Desconhecidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original `c9dc201e555f…` | 5 | 172 | 4.243 | 277 | 4 |
| Security1 `dc990d07c8ce…` | 0 | 0 | 37 | 4 | 0 |

As varreduras foram executadas neste lote e usaram o mesmo cache Trivy:
UpdatedAt **2026-10-14T13:10:32Z**, DownloadedAt **2026-10-14T19:25:50Z**,
NextUpdate **2026-10-15T13:10:32Z**. O comando solicitou atualização, mas o cache
continuava válido. Não afirmar que novos advisories foram baixados em 15/10.
O snapshot anterior tinha 171 altos; a nova comparação da imagem original
produziu 172. A tabela geral de 14/10 permanece um registro histórico.

São ocorrências por pacote/artefato, não necessariamente CVEs distintos ou
exploração comprovada. Nenhuma regra de supressão foi aplicada. Os 37 médios e
quatro baixos seguem abertos. Trivy não demonstra cobertura completa de
dependências Haskell compiladas, kernel do host ou código da aplicação.

## O que mudou na imagem

A versão permanece **PostgREST 14.17**, com o **mesmo executável ARM64**:
SHA256 `4eee06ead8d14318fd02ea182f919cca0c9487b01a4780dffe9532664155e8c8`.
Versão, identidade do binário e resolução de bibliotecas foram conferidas.
Não houve recompilação do PostgREST, nova migração ou alteração do frontend.

O Dockerfile ARM64 do fornecedor instala gcc, libpq-dev, zlib1g-dev e
libnuma-dev. Na imagem anterior também havia linux-libc-dev e um executável
Pebble com alertas Go, embora o processo principal fosse diretamente postgrest.

A imagem nova parte da mesma referência Ubuntu Resolute fixada pelo fornecedor,
atualiza os pacotes e instala somente as bibliotecas necessárias ao runtime,
incluindo libpq5, libnuma1, libgmp10, zlib1g e certificados. Não instala os
compiladores/pacotes de desenvolvimento e remove o Pebble não utilizado.
A ausência de gcc, linux-libc-dev, libssl-dev, libpq-dev, libnuma-dev e do binário
Pebble foi conferida. Os metadados dos pacotes instalados foram preservados.

Os cinco críticos anteriores estavam em linux-libc-dev. Remover cabeçalhos de
uma imagem de execução elimina esses arquivos desnecessários; **não corrige
nem diagnostica o kernel que está rodando na VM**. Os avisos Go daquele
executável foram eliminados pela remoção do arquivo, sem alegar recompilação
ou correção de uma biblioteca Haskell.

Tamanho informado pelo Docker, no mesmo engine: 162.762.786 → 83.537.941 bytes.
Os pacotes APT são resolvidos no build; uma reconstrução futura pode gerar
outros pacotes/digests e precisa de nova varredura e validação.

## Controles efetivos

- UID/GID **1000:1000**, sem execução como root.
- Root filesystem somente para leitura; nenhum volume da aplicação montado.
- Todas as capabilities removidas; CapEff zero, NoNewPrivs 1 e Seccomp 2.
- Limite de 256 PIDs; bits setuid/setgid removidos da imagem.
- Healthcheck original `postgrest --ready` mantido.
- Segredos, conexão do banco, schemas expostos e parâmetros funcionais da API
  preservados; configurações dos outros serviços comparadas antes/depois.

As proteções de execução estão no compose, além da imagem. Fazer somente
docker load não reconstitui todos esses controles.

## O que foi validado

A fixture usou rede interna, PostgreSQL temporário, dados/segredos sintéticos,
sem portas publicadas e sem workers externos. Cobriu:

- JWT com assinatura errada, expirado e role não concedida recusados.
- Anônimo sem acesso a alunos/RPC; dois usuários autenticados isolados por RLS.
- Criação, atualização com Unicode, exclusão, conflito de duplicidade e recusa
  de escrita em registros de outro proprietário.
- Paginação/contagem exata, HEAD, filtros inválidos, schema não exposto e RPC
  que respeita RLS; bypass de service_role validado explicitamente na fixture.
- Hook anterior à requisição, consultas concorrentes/prepared statements,
  reinício e preservação dos registros.
- Identidade da imagem/binário, controles do processo e ausência de ferramentas
  de build, arquivos privilegiados e executável auxiliar removido.

As tentativas anteriores ficaram preservadas: hostname não explícito para o
health CLI; inspeção de diretórios privados como usuário limitado; e hook de
fixture que tentava INSERT em uma transação GET somente para leitura. A fixture
final usa host explícito, inspeção separada da imagem e GUC local para o hook.
Não foram falhas atribuídas indevidamente à API de produção. Containers, rede
e arquivo de segredos da fixture final foram removidos e conferidos.

Em produção, a validação assinou um JWT curto com o segredo privado do servidor
para o administrador ativo existente. Isso comprova autorização no PostgREST,
**não um novo teste de login por senha no Auth**. Conferiu leitura de IDs de
alunos, RPC real get_workout_dashboard, recusa anônima e recusa da RPC para
service_role, além de healthchecks e controles do runtime. Nenhum token foi
publicado ou persistido como credencial de cliente.

Antes/depois: **três alunos, um usuário Auth, duas avaliações, 19 mensagens,
58 registros programados e dois crons ativos**. Os fingerprints dos schemas
public/auth/storage e das funções nesses schemas permaneceram iguais.
Isso não equivale a um teste prolongado de carga ou de todos os fluxos visuais.

## Backup, imagem e retorno

Backup anterior **20261015T010314Z**: cinco arquivos copiados para o computador
e SHA256 calculados independentemente. Compose e inspeção anteriores mais a
imagem exportada também foram copiados: **oito arquivos verificados antes da
troca**. O backup posterior **20261015T010534Z** acrescenta cinco arquivos,
também copiados e conferidos. A restauração de metadados do pooler já comprovada
na entrega anterior não foi confundida com restore completo deste sistema.

Imagem exportada: runtime-image.tar.gz, **81.938.593 bytes**, SHA256
`c3d4cc58cfbc162d2e8e25230610f340b4f03919975701a0c66bdefedd762d63`.
Índice OCI e manifest correspondem à imagem publicada; **seis blobs** tiveram
seus digests conferidos. Após docker load, atribuir a tag security1 ao ID
verificado antes de usar o compose preservado.

O script release.py exige a imagem anterior, zero críticos/altos na candidata,
41 checks, backup recente e hashes independentes. Recria somente rest e faz
retorno automático se os checks falharem. O retorno manual verifica o hash
atual do compose e a imagem antiga, restaura o compose anterior e recria rest,
sem restaurar banco. Não foi necessário acioná-lo. Alterações posteriores no
compose exigem revisão; não usar scripts antigos para desfazer entregas novas.

Evidências privadas na VM: `/home/ubuntu/workout-postgrest-security-20261014`
e `/home/ubuntu/workout-postgrest-release-20261014`. Cópia local em
`C:/Users/pejon/.codex/ssh-workout04/postgrest-release-20261014/`.
Pacote evidence.tar.gz, sem duplicar a imagem: **3.458.568 bytes**, SHA256
`ab7d80c84d23f4323c7b35bff8dd82ae27687a4011f4597affce8a4b2996ebb5`.
Contém inspeções/configurações com credenciais: manter fora do Git.

Continuam pendentes os outros containers, riscos residuais do pooler/Storage,
redução do uso administrativo nos demais serviços, rotação coordenada de
segredos, armazenamento externo independente e recuperação integrada completa.
A auditoria geral continua aberta.

## Fontes primárias

- [Dockerfile ARM64 do PostgREST 14.17](https://github.com/PostgREST/postgrest/blob/v14.17/Dockerfile).
- [CLI e healthcheck do PostgREST](https://docs.postgrest.org/en/v14/references/cli.html).
