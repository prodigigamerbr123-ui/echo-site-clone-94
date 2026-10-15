# Recuperação integrada e preservação das imagens — 15/10/2026

## Resultado comprovado

O snapshot **20261015T162649Z** foi restaurado em uma stack descartável: banco
principal completo, metadados `_supabase`, Auth, PostgREST, Storage, Edge Functions
e gateway. A quinta tentativa passou em **39 verificações**, incluindo reinício,
refresh de sessão, leitura do dashboard e execução de função com consulta real.
Todos os containers/rede do exercício foram removidos e os envs temporários
apagados. Produção foi somente lida e seu fingerprint permaneceu igual.

O ensaio usou imagens já disponíveis na VM, com novos containers, banco em tmpfs,
rede interna e nenhuma porta publicada. **Não é um ensaio de reconstrução de uma
VM vazia**, nem de recuperação de DNS/TLS, Evolution/WhatsApp, Realtime, execução
do pooler ou provedores externos. Os metadados do pooler foram restaurados, mas
seu processo não fez parte desta stack. Esses limites permanecem na matriz.

## O que foi recuperado e verificado

- Cinco arquivos do backup conferidos pelo SHA256 do manifesto, também copiados
  e verificados no computador fora da VM.
- Restore completo dos dumps `postgres` e `_supabase` com `--exit-on-error`;
  papéis/permissões restaurados com as senhas técnicas removidas do SQL.
- Contagens recuperadas: três alunos, duas avaliações, 19 mensagens, 58 mensagens
  programadas e um usuário original do Auth. Dados dos alunos/avaliações, hashes
  das senhas, migrações e funções públicas comparados com produção antes de
  introduzir fixtures. Nenhum dado pessoal foi colocado neste relatório.
- 34 arquivos de funções, 222 arquivos de cache Deno e um arquivo do diretório de
  Storage restaurados e comparados com os hashes das entradas do arquivo.
- O Storage original tinha **zero buckets/objetos**; o arquivo era de estrutura.
  Upload/download privado e persistência após reinício foram comprovados com um
  bucket/arquivo sintético. Não alegar download de anexos reais inexistentes.
- Usuário fictício criado pelo Auth restaurado; login, autorização do dashboard,
  recusa de consulta anônima e refresh após reinício passaram.
- `daily-briefing` carregou e aplicou autenticação/permissões antes de recusar GET.
  `ai-database-actions/get_students_needing_followup` executou a consulta restaurada
  e retornou a quantidade esperada; recusa sem confirmação e execução após
  reinício também passaram. Não houve geração paga de IA.

## Barreiras contra efeitos externos

`cron.launch_active_jobs=off` foi aplicado antes do restore; depois, todos os jobs
da cópia foram desativados. `pg_net` precisava estar no preload para restaurar a
extensão: seu worker foi direcionado a template1 sem a extensão e recebeu
`pg_net.batch_size=0`. A rede é interna; não foram fornecidas credenciais de
Evolution, Gemini, Lovable ou SMTP aos processos. Nenhum worker de envio foi
invocado. As configurações reais extraídas permaneceram privadas e não foram
usadas como env da stack descartável.

A cópia da configuração do banco incluiu a chave pgsodium do backup e permissões
compatíveis com o usuário postgres da imagem (UID 100/GID 101 nesta versão).
Não foi feito um teste separado de decriptação de segredos do Vault.

## Lacuna encontrada e corrigida no backup

O cache Deno ficava em um volume Docker fora do diretório da stack. Os snapshots
anteriores continham as funções, mas não esse cache, deixando a recuperação
dependente de downloads externos. `backup.py` instalado agora identifica o mount,
recusa caminho inesperado e inclui o conteúdo como `volumes/deno-cache` dentro de
`runtime.tar.gz`, mantendo cinco arquivos no snapshot.

O backup exige o código do entrypoint, deno.jsonc, cache e configurações do
pooler/Envoy. O snapshot manual novo foi copiado e SHA256 conferido; o restore
provou que a função carregou na rede isolada. A primeira execução **automática
com o cache** ainda precisa ser observada; a execução automática anterior de
15/10 já comprovou a cobertura dos dois bancos e configurações ampliadas.

## Tempos, RTO/RPO e tentativas

Rodada final: **20,42 segundos** da validação do backup até os checks funcionais,
excluindo limpeza final. Uma rodada anterior passou em 36 checks/22,85 segundos;
a rodada final acrescentou a execução de função real e seus limites. O ambiente
tem poucos registros e imagens prontas. Esse número é uma medição técnica deste
ensaio, **não um RTO operacional contratado**. Preparação/correções humanas,
download de imagens, provisionamento, DNS e provedores não estão incluídos.

RTO completo e perda máxima aceitável precisam ser definidos com a academia.
Com um backup diário, o intervalo nominal é aproximadamente 24 horas, acrescido
de atrasos/falhas; não garantir um RPO de 24 horas sem monitoramento e cópia
independente disponíveis. A sincronização atual depende deste computador.

Tentativas falhas foram preservadas: permissão da chave com UID presumido,
preload obrigatório do pg_net e criação de `_supabase` usando template1 ocupado
pelo worker. O procedimento agora descobre UID/GID, isola o worker e cria o banco
a partir de template0. As fixtures falhas também foram removidas.

## Imagens personalizadas preservadas fora da VM

Além das cópias anteriores de Auth, pooler e PostgREST, foram copiadas/conferidas:

| Serviço | ID da imagem | Blobs OCI conferidos | Arquivo comprimido |
| --- | --- | ---: | ---: |
| Storage security2 | `8117cb0357a0…` | 21 | 339.543.084 bytes |
| Nginx dos dois gateways | `c598465d0720…` | 11 | 29.691.236 bytes |
| Evolution GO | `11f42613e1f8…` | 11 | 87.754.367 bytes |

SHA256, blobs, index/manifest/config e lista de layers conferidos. A cópia da
imagem Evolution **não é backup de seu banco, licença ou sessão WhatsApp**.
Diretório privado local: `C:/Users/pejon/.codex/ssh-workout04/preserved-images-20261015/`.
O manifesto privado registra IDs completos e hashes; não contém inspeções de env.

## Evidência e retomada

Script: `ops/supabase-self-hosted/restore-integrated.py SNAPSHOT ATTEMPT_NUMBER`.
Cada tentativa cria diretório e prefixo próprios, recusa colisões e verifica
cleanup. Inspecionar o estado antes de reutilizar; dados extraídos/logs são privados.

Evidência copiada e SHA256 conferido: 31.608 bytes,
`d53a1e6fe3edbc11958ae5e8c5c3b2a4add998ba8d75d215a6811bf97bd6e4d8`,
em `C:/Users/pejon/.codex/ssh-workout04/integrated-restore-20261015/evidence.tar.gz`.

Restam: recuperação em host vazio, infraestrutura/provedores externos, proteção
independente dos backups, política final de RTO/RPO e continuidade da Evolution.

Referências: [configuração pg_cron](https://github.com/citusdata/pg_cron#extension-settings)
e [worker pg_net 0.20.3](https://github.com/supabase/pg_net/blob/v0.20.3/src/worker.c).
