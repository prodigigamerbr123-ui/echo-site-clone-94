# Pooler: reconstrução, testes e bloqueios — 14/10/2026

> Atualização posterior: pooler security1 publicado após revisão dos alertas residuais, endurecimento do runtime, 32 verificações isoladas, backup e restauração de metadados. Ver [publicação de 14/10](pooler-publicacao-2026-10-14.md). Os estados de candidata/bloqueio abaixo preservam a fotografia anterior.

> Continuidade: uma candidata posterior corrigiu nove bibliotecas e ajustou Finch, passou em 21 verificações e reduziu a consulta Hex para seis registros em quatro pacotes. Ainda não publicada. Ver [correções de dependências](pooler-dependencias-2026-10-14.md). Os resultados abaixo preservam a etapa anterior.

## Resultado e produção

**Nenhuma troca em produção.** Supavisor 2.9.12 continua saudável na imagem
`sha256:464b93a60ba8c96bc06dad7f241562d6613b2a994922307717b05f432ae415c2`,
com StartedAt `2026-10-11T19:11:48Z`. Portas de host 5433 e 6543 estão ligadas
a 127.0.0.1; isso não constitui uma validação completa de exposição por túneis.

A candidata Trixie funciona no ambiente descartável, mas **não está aprovada
para produção**: mantém 48 ocorrências altas na imagem e a triagem das
dependências Elixir ainda está aberta. Não executar uma troca usando somente
o resultado funcional. Não houve escrita no banco de produção, mensagens reais
ou chamadas pagas de IA neste lote.

## Construção e comparação

Fonte Supavisor 2.9.12 fixada no commit
`e8719d9ac5a43604c46d2d9e15bb34c76dea8f12`; arquivo de fonte SHA256
`8b883bd6cc72db080ac4e6abfa90f11ba433bae41e3e8e5e4618ff49199ab098`.
O `mix.lock` efetivamente usado no builder permaneceu idêntico ao upstream:
SHA256 `1e40fd2c5a91b747874470f77ed8651dcab592fad83a4d37ebe0481e7c5d41a2`.

A primeira construção, com OTP 27.2.1, falhou na validação de certificado ao
baixar Hex. Foi preservada. A seguinte usou Elixir 1.18.4 e OTP 27.3.4.16,
mantendo as séries principais. Nenhuma verificação TLS foi desativada.
Rust 1.90.0 e ferramentas de compilação ficam no builder; o runtime inclui
somente a release e bibliotecas/utilitários selecionados.

| Imagem | Base | Críticos | Altos | Médios | Baixos | Desconhecidos |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Produção, nova varredura | Debian 11.11, EOSL | 26 | 731 | 4000 | 2130 | 74 |
| Candidata Bookworm, recusada | Debian 12.15 | 1 | 62 | 165 | 149 | 23 |
| Candidata Trixie, bloqueada | Debian 13.7 | 0 | 48 | 115 | 129 | 33 |

Candidata Trixie: `workout-supavisor:2.9.12-trixie-candidate1`, imagem
`sha256:a6e02352900874aa9bd76bb0089610fb6dd3fbe285dc3131876e07dd4222b8f6`.
Bookworm: `sha256:76d02ebc12d382964ed093ba90053e234a8c13a5c1e871f4291c67a4124f641a`.

As três varreduras utilizaram o mesmo snapshot Trivy, atualizado em
14/10 às 13:10:32 UTC e baixado às 19:25:50 UTC, NextUpdate 15/10 às
13:10:32 UTC. Metadados das bases foram comparados. O número anterior de 727
altos pertence ao snapshot antigo; 731 não representa uma alteração na imagem.
Contagens são ocorrências por pacote, com duplicações, não falhas exploráveis
confirmadas. Não foram usadas supressões.

Nenhum dos 48 altos da candidata Trixie tem FixedVersion no scanner. Incluem
famílias util-linux, curl, ncurses, ACL, systemd/udev e Perl. Os avisos de
util-linux aparecem em vários pacotes derivados e exigem análise de binários,
privilégios e caminhos usados. Não corrigir isso removendo apenas metadados do
gerenciador de pacotes ou ocultando CVEs.

## Dependências da aplicação: descoberta adicional

`audit-hex.py` consultou OSV para 82 pacotes Hex do lockfile: 61 registros de
advisories em 12 pacotes. Há aliases e condições de uso; não somar esses
registros como 61 vulnerabilidades distintas. As versões abaixo foram também
confirmadas nos diretórios de bibliotecas da imagem de produção.

| Pacote | Versão instalada | Registros retornados |
| --- | --- | ---: |
| cloak | 1.1.4 | 1 |
| cloak_ecto | 1.3.0 | 1 |
| cowboy | 2.13.0 | 4 |
| cowlib | 2.14.0 | 11 |
| decimal | 2.3.0 | 3 |
| hpax | 1.0.2 | 1 |
| mint | 1.7.1 | 17 |
| phoenix | 1.7.20 | 6 |
| phoenix_live_view | 1.0.4 | 1 |
| plug | 1.20.1 | 2 |
| req | 0.5.8 | 4 |
| tesla | 1.14.1 | 10 |

Triagem inicial: a configuração runtime.exs instalada corresponde à fonte
fixada e configura AES-GCM, sem AES-CTR. O aviso Cloak CVE-2026-95105 trata
do caminho CTR; não foi evidenciado uso desse caminho aqui. Também não foi
encontrado uso de Cloak.Ecto.PBKDF2 no código lib da aplicação, relevante para
CVE-2026-94206. Isso não equivale a testar todos os fluxos criptográficos.

O aviso Phoenix GHSA-628h-q48j-jr6q exige verificar uso do transporte long-poll;
não basta a biblioteca estar instalada. A fonte configura socket WebSocket e
parsers multipart; alcance das rotas e condições dos demais avisos ainda
precisam ser revisados. Atualizações de Req/Decimal podem envolver mudança de
série principal e não devem ser forçadas sem validação.

Esta consulta cobre Hex, não dependências Git, Rust/C do parser nativo nem
todas as vulnerabilidades do OTP compilado. Zero no scanner de imagem não
seria suficiente para encerrar essa análise.

## Validação funcional isolada

Passaram 14 verificações: rede interna, imagem imutável, ausência de portas
publicadas, prontidão SQL, consultas nos modos transaction/session,
rollback/commit, prepared statement em sessão, 12 clientes distribuídos por
seis tarefas concorrentes, senha incorreta, recusa de catálogo privilegiado,
conexão após reinício e histórico de migrações de teste inalterado.

O primeiro SELECT da primeira tentativa encerrou a conexão apesar da saúde
HTTP; a tentativa seguinte passou com espera explícita pela prontidão SQL,
sem alterar a imagem. Não se afirma uma causa interna definitiva para a falha
inicial. Logs e verificadores executados foram preservados.

Banco em tmpfs, senhas novas, nenhum dado de alunos restaurado. Confirmadas
remoção dos containers, rede e arquivo de segredos da fixture. Os 23 arquivos
de migração da release candidata coincidem com a produção; isso não substitui
um teste de upgrade sobre metadados restaurados da produção.

As conexões da fixture não tinham TLS próprio; o teste interno não valida
certificados de clientes, TLS externo, carga prolongada ou continuidade de
conexões durante uma troca real. Nenhuma migração de produção foi aplicada.

## Evidências e continuidade

Ferramentas versionadas: `ops/supabase-self-hosted/pooler-security/`.
Evidência privada na VM: `/home/ubuntu/workout-pooler-security-20261014`.
Cópia local: `C:/Users/pejon/.codex/ssh-workout04/pooler-security-20261014/evidence.tar.gz`,
6.001.708 bytes, SHA256
`adcfb2a1f99e0867e625f2d2ede85f3490ccb585387d2b8eccccd6a9fd609e48`,
calculado independentemente e comparado ao servidor. Preservar fora do Git.
Inclui scans, fontes compactadas, logs, verificadores executados e versões
finais com conferência de limpeza; não inclui exportação Docker das imagens.

Próximo trabalho: deduplicar advisories, concluir aplicabilidade por caminho,
reduzir componentes/privilégios do runtime e preparar correções compatíveis
das dependências. Depois, repetir SCA, validar metadados restaurados e carga,
preservar as imagens necessárias fora da VM e só então preparar publicação
com backup recente verificado e retorno. A auditoria do pooler permanece aberta.

## Fontes primárias

- [Dockerfile Supavisor 2.9.12](https://github.com/supabase/supavisor/blob/e8719d9ac5a43604c46d2d9e15bb34c76dea8f12/Dockerfile).
- [Releases Supavisor](https://github.com/supabase/supavisor/releases).
- [Cloak AES-CTR](https://cna.erlef.org/cves/CVE-2026-95105.html).
- [Cloak PBKDF2](https://cna.erlef.org/cves/CVE-2026-94206.html).
- [Phoenix long-poll](https://github.com/phoenixframework/phoenix/security/advisories/GHSA-628h-q48j-jr6q).
- [OSV API](https://google.github.io/osv.dev/api/).
