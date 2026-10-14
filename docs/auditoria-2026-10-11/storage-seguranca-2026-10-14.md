# Storage: dependências e Node — 14/10/2026

## Objetivo e baseline

Corrigir os 41 alertas altos restantes em `workout-storage:1.74.0-security1`, imagem `sha256:527e41281258698d48648b9d2e6f881956393028f18a09967ec6bc9e2c115e42`, mantendo o código Storage 1.74.0 e suas migrações. A varredura atual de produção está em `runtime-seguranca-2026-10-14.md`; usa 15 imagens distintas e o banco Trivy com UpdatedAt de 13/10 às 19:11 UTC, ainda válido segundo seu NextUpdate no momento da execução.

## Construção e decisões

Instalação de dependências em estágio separado, usando a imagem original por digest. Versões de correção foram confirmadas no registro npm e nas fontes primárias. Fastify ficou na série 5, Undici npm na série 7 e dependências transitivas nas séries compatíveis. O resolvedor informou um pacote adicionado, um removido e 17 alterados. O lockfile resultante e o ID da imagem precisam acompanhar a evidência; uma reconstrução futura pode resolver grafo diferente e exige revalidação.

Correções incluem Fastify 5.12.2, Undici npm 7.29.1, busboy 3.2.1, grpc-js 1.14.5, propagator-jaeger 2.9.0, brace-expansion 2.1.6/5.0.11, fast-uri 3.1.7/4.1.4, ip-address 10.3.1, js-yaml 4.3.2 e protobufjs 7.6.1. Declarações diretas de dependências, inclusive as de desenvolvimento omitidas do runtime, foram alinhadas aos overrides para evitar EOVERRIDE.

A árvore final de node_modules é substituída por inteiro, evitando resíduos de módulos antigos ao copiar sobre um diretório existente. Não são executados scripts npm de instalação. Ferramentas npm/Corepack continuam ausentes do runtime.

Uma primeira candidata com dependências corrigidas caiu de 41 para três altos e foi rejeitada automaticamente. A triagem inicial interpretou o rótulo de resultado `Node.js` como referência ao Undici embutido. Essa interpretação estava errada: a inspeção de PkgPath mostrou `app/node_modules/@platformatic/foundation/node_modules/undici/package.json`, versão 7.28.0. Atualizar somente a dependência direta não havia atualizado essa cópia transitiva. Foi adicionado override na série 7 para cobrir também as cópias aninhadas; nenhum alerta foi suprimido. O Undici embutido consultado por process.versions é outro componente: 7.29.0 na imagem anterior e 7.29.1 no Node novo.

Foi então incluído Node 24.21.0 da imagem oficial Alpine por digest, com Undici embutido 7.29.1. A ABI consultada permaneceu 137. A tag Docker 24.22.0-alpine3.23 não estava disponível, embora a versão Node 24.22.0 já aparecesse no catálogo oficial; não se presumiu a existência da imagem. O binário 24.21.0 disponível foi escolhido para validação, sem mudar a série principal. Cabeçalhos de compilação antigos foram retirados da camada final.

Tentativas de construção preservadas no diretório privado: flag --progress não suportada pelo builder instalado; conflito inicial de override direto; cópia inicial por mesclagem substituída por árvore limpa; candidatas recusadas por três altos da cópia transitiva do Undici, inclusive após atualizar Node. Nenhuma dessas candidatas foi publicada em produção.

## Validação e publicação

**Publicado**: `workout-storage:1.74.0-security2`, imagem `sha256:8117cb0357a04b06ec1004855a192322f47beb7fe99beea866db203fd0d60e51`.

| Imagem | Críticos | Altos | Médios | Baixos |
| --- | ---: | ---: | ---: | ---: |
| Produção anterior security1 | 0 | 41 | 37 | 4 |
| Candidata somente dependências, recusada | 0 | 3 | 34 | 3 |
| Candidata com Node novo, ainda recusada | 0 | 3 | 34 | 3 |
| security2 com cópias transitivas corrigidas, publicada | 0 | 0 | 25 | 0 |

Comparação com o mesmo snapshot de banco Trivy, sem supressões. O verificador independente percorreu a árvore efetivamente instalada e conferiu 14 cópias dos pacotes-alvo, incluindo Undici aninhado. Lockfile resolvido preservado fora do Git, SHA256 `6c78e6839e71b7cbbb2fc3feda5733fb7a09798dd4b9fcbf5ec944dd52b7a37b`. Relatório de scan SHA256 `0cd5acc07542c95328f527a5dcd1a46081fc460b3759c6d732c73fdf0c36bdb8`.

As **31 verificações isoladas** passaram: rede interna, candidato distinto de produção, identidade de dist/migrations, Node esperado, ABI 137 preservada, Undici embutido esperado, xattr nativo funcional, saúde, bucket privado, upload/download/lista/cópia/movimentação/upsert, recusa de duplicata, URLs assinadas, recusas de acesso anônimo/sem vínculo e preservação do objeto após exclusão não autorizada. Fixtures, objetos, bucket e container candidato foram removidos; Storage original de staging continuou rodando e seu histórico de migrações permaneceu igual.

Não houve testes de carga prolongada, TUS, S3 ou transformação de imagens. Não houve WhatsApp real nem chamada paga de IA.

## Backup, produção e retorno

Backup novo `20261014T182248Z`, com dump, roles, runtime e configuração do PostgreSQL. Os quatro arquivos foram copiados e tiveram hashes calculados independentemente no computador, comparados à prova gerada no servidor. Também foram copiados e conferidos compose e inspeção anteriores: seis arquivos privados no total. O catálogo do dump foi validado pelo procedimento existente. Isso ainda não é um exercício completo de restauração.

Somente Storage foi recriado, com `--no-deps --pull never`. Depois da troca: healthy, leitura privilegiada de buckets permitida, Auth saudável e consulta anônima de alunos recusada. Antes/depois: zero buckets/objetos, três alunos, um usuário, dois crons ativos e o mesmo hash do histórico de migrações `b6a64250a5b44db7cb834bd965efe7f2`.

Comparado ao inventário da varredura, apenas a imagem do Storage mudou. Os outros serviços têm StartedAt anterior à manutenção. Nenhuma migração de banco foi aplicada por este lote. Testes HTTPS externos de Auth health e Storage status retornaram 200 com Origin do site e User-Agent de navegador; acesso anônimo a alunos foi recusado com 401. Requisições iniciais padrão urllib, sem esses cabeçalhos, receberam 403; não se atribuiu a recusa a uma camada específica.

Estado da release: `/home/ubuntu/workout-storage-dependencies-release-20261014/state.json`, fase `published`. Evidências completas copiadas para `C:/Users/pejon/.codex/ssh-workout04/storage-dependencies-release-20261014/evidence.tar.gz`, SHA256 `1a600caa921988b0743aad9ec8175d2dc800bb6ac8da9bfb770695ff81858736`, conferido no computador. Incluem inspeções com credenciais; manter fora do Git.

O rollback restaura compose/imagem security1, mantida na VM, sem restaurar banco. Não precisou ser executado. Recuperação após perda da VM também depende de preservar ou reconstruir e validar as imagens customizadas; backup de banco/runtime sozinho não resolve essa dependência.

## Pendências

Os 25 alertas médios restantes precisam de triagem e correção próprias. Outros serviços ainda apresentam altos/críticos, inclusive o pooler com base Debian 11 fora do LTS. Permanecem restore completo, retenção/cópias externas das imagens, carga prolongada e verificações adicionais de protocolos conforme uso. A auditoria geral continua aberta.

## Procedimentos

Receita e ferramentas: `ops/supabase-self-hosted/storage-security/dependencies/`. Evidências privadas na VM: `/home/ubuntu/workout-storage-dependencies-20261014`. Release usa diretório separado `/home/ubuntu/workout-storage-dependencies-release-20261014`.

`validate-candidate.py` analisa a imagem imutável, bloqueia críticos/altos e executa `verify-stage.py`. A homologação usa a stack isolada existente, arquivos e bucket exclusivos e limpeza ao final. Código dist e migrações devem coincidir por hash; versão, ABI e addon nativo são verificados. O script de release exige prova de hashes calculados independentemente e restaura compose/imagem anteriores se os checks após a troca falharem.

## Fontes primárias

- [Fastify 5.12.2](https://github.com/fastify/fastify/releases/tag/v5.12.2).
- [gRPC JavaScript 1.14.5](https://github.com/grpc/grpc-node/releases/tag/@grpc%2Fgrpc-js@1.14.5).
- [Undici 7.29.1](https://github.com/nodejs/undici/releases/tag/v7.29.1).
- [Receita oficial Node Alpine](https://github.com/nodejs/docker-node/blob/main/24/alpine3.23/Dockerfile).
- [Catálogo de versões Node](https://nodejs.org/dist/index.json).
- [Atualização Supabase self-hosted](https://supabase.com/docs/guides/self-hosting/updating).
