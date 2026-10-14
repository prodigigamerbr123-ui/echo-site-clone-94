# Pooler: correções das dependências — 14/10/2026

> Atualização posterior: pooler security1 publicado após revisão dos alertas residuais, endurecimento do runtime, 32 verificações isoladas, backup e restauração de metadados. Ver [publicação de 14/10](pooler-publicacao-2026-10-14.md). Os estados de candidata/bloqueio abaixo preservam a fotografia anterior.

## Resultado

Candidata construída e validada, **não publicada**:
`workout-supavisor:2.9.12-dependencies-candidate3`, imagem
`sha256:22783b18ac629a3f6ec2147954e92720f7b214ff07402b962c9bbc86a2193561`.
Passaram 21 verificações isoladas. A consulta OSV de 82 pacotes Hex passou de
61 registros em 12 pacotes para seis registros em quatro pacotes. São registros
de advisories, com aliases e condições de uso, não CVEs únicos confirmados como
exploráveis. Nenhum aviso foi suprimido.

A varredura da imagem continua com zero críticos, 48 altos, 115 médios, 129
baixos e 33 desconhecidos. É a mesma base Debian 13.7 da candidata anterior;
esses alertas de sistema operacional não são resolvidos pelas correções Hex.
O snapshot Trivy é o mesmo, UpdatedAt 14/10 às 13:10:32 UTC. A promoção para
produção permanece bloqueada pela triagem e correções restantes.

## Versões e controle do escopo

| Pacote | Original | Candidata |
| --- | --- | --- |
| cowboy | 2.13.0 | 2.20.0 |
| cowlib | 2.14.0 | 2.21.0 |
| hpax | 1.0.2 | 1.0.4 |
| mint | 1.7.1 | 1.10.2 |
| phoenix | 1.7.20 | 1.7.24 |
| phoenix_live_view | 1.0.4 | 1.0.19 |
| plug | 1.20.1 | 1.20.3 |
| req | 0.5.8 | 0.6.3 |
| tesla | 1.14.1 | 1.18.3 |
| finch, suporte para Req | 0.19.0 | 0.22.0 |

As nove bibliotecas com avisos foram atualizadas e Finch foi ajustado como
dependência de suporte. Todas as outras versões Hex e todas as entradas Git
foram preservadas, incluindo Ecto, Decimal e o Postgrex fixado pelo projeto.
Não foram adicionados nem removidos pacotes no lockfile. As dez versões foram
conferidas na árvore instalada, exigindo uma única cópia de cada biblioteca.

O resolvedor passou a usar desbloqueio explícito dos dez pacotes e `deps.get`.
Uma candidata anterior com atualização recursiva alterava dependências fora
do escopo, como Decimal 2.4.1 e Finch 0.24.0, e foi recusada. Outra verificação
detectou bibliotecas antigas retidas por `mix release --overwrite`: a receita
agora recria o diretório de release antes de montar a imagem. A permissão
executável de limits.sh também foi corrigida e seu funcionamento é conferido
antes da varredura. Tentativas recusadas foram preservadas fora do Git.

Lockfile final SHA256:
`5ec8fe415d9461ec19b75d0e129a8afa496da2fceaf77ced4d330ed6a88d83fa`.
Fonte base permanece no commit Supavisor
`e8719d9ac5a43604c46d2d9e15bb34c76dea8f12`; somente a declaração de
dependências é ajustada. Os 23 arquivos de migração e os addons nativos
coincidem por hash com a candidata anterior.

## Verificação e limites

Passaram os 14 checks anteriores de rede, imagem, portas, prontidão SQL,
conexões session/transaction, commit/rollback, prepared statement, concorrência,
recusa de senha incorreta, restrição de catálogo e reinício sem nova migração.

Foram acrescentados seis testes do próprio
`Supavisor.Helpers.check_user_has_jit_role`: papel correto, papel diferente,
corpo inválido, HTTP 401, 403 e 500. O adapter Plug executa o Req real sem
contatar um provedor externo; confere token e corpo da requisição da fixture.

O sétimo check adicional inicia Cowboy em loopback dentro do container,
confirma uma resposta válida e verifica a recusa de uma resposta contendo CRLF
em um cabeçalho. Isso valida a proteção do servidor no caso representado pelo
teste; não demonstra correção de todos os consumidores do encoder Cowlib.

Uma tentativa de RPC falhou por hostname curto no ambiente descartável. A
fixture agora fixa NODE_IP em 127.0.0.1; a imagem não mudou para corrigir esse
problema de teste. Containers, rede e arquivo de segredos foram removidos e a
limpeza foi conferida. Não houve restauração de alunos, mensagens reais,
chamadas pagas, alterações de configuração ou migrações de produção.

Não foram feitos teste prolongado de carga, validação completa de TLS ou
upgrade sobre cópia dos metadados de produção. Scans Hex/imagem também não
encerram a análise das dependências Git, OTP compilado e código Rust/C.

## Pendências específicas

| Pacote residual | Registros | Encaminhamento |
| --- | ---: | --- |
| cloak 1.1.4 | 1 | Aviso CTR; configuração verificada usa AES-GCM, sem CTR. Manter evidência de aplicabilidade. |
| cloak_ecto 1.3.0 | 1 | Aviso PBKDF2; não foi encontrado uso desse campo no código lib da aplicação. Não extrapolar para todos os fluxos. |
| cowlib 2.21.0 | 1 | CVE-2026-43966 permanece no catálogo; proteção de saída do Cowboy novo foi testada. Revisar demais consumidores de structured headers. |
| decimal 2.3.0 | 3 | Revisar alcance dos parsers e uma correção compatível. O Postgrex fixado declara Decimal ~>1.5 ou ~>2.0; não forçar a série 3. |

Seguem pendentes os 48 altos da base Debian, redução de privilégios e
componentes, metadados restaurados, carga e preservação externa das imagens.
Depois dessas etapas, preparar uma publicação com backup recente verificado
e plano de retorno. Não promover esta candidata apenas porque os testes
funcionais passaram.

## Evidência operacional

Produção conferida no fim: imagem
`sha256:464b93a60ba8c96bc06dad7f241562d6613b2a994922307717b05f432ae415c2`,
saudável, StartedAt de 11/10 às 19:11:48 UTC, sem recriação neste lote.

Diretório privado na VM: `/home/ubuntu/workout-pooler-dependencies-20261014`.
Cópia local: `C:/Users/pejon/.codex/ssh-workout04/pooler-dependencies-20261014/evidence.tar.gz`,
572.808 bytes; SHA256 independente conferido:
`9aa8df00241abd44ecb9745e28379631e7ac01a253c1bba4be4c1b02f633ce0f`.
Contém provas, lockfile, scans, detalhes dos avisos, testes e tentativas recusadas;
manter fora do Git. Não inclui exportação Docker das imagens.

Receitas: `ops/supabase-self-hosted/pooler-security/`. A construção depende dos
pais locais revisados por ID imutável; estes precisam ser preservados ou
reconstruídos com validação própria em uma recuperação da VM.

## Fontes primárias

- [Phoenix 1.7.24](https://github.com/phoenixframework/phoenix/releases/tag/v1.7.24).
- [Req 0.6.3](https://github.com/wojtekmach/req/releases/tag/v0.6.3).
- [Cowboy 2.20.0](https://github.com/ninenines/cowboy/releases/tag/2.20.0).
- [Cowlib CVE-2026-43966 e condições de mitigação](https://cna.erlef.org/cves/CVE-2026-43966.html).
- [Postgrex fixado pelo projeto](https://github.com/elixir-ecto/postgrex/blob/0f92ae39c8f43b6cf39a46ab1142f6fc09be40fe/mix.exs).
- [Comportamento de deps.update e atualização sem filhos](https://github.com/elixir-lang/elixir/blob/v1.18.4/lib/mix/lib/mix/tasks/deps.update.ex).
