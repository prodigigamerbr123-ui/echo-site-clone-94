# Storage: primeiro lote de segurança — 13/10/2026

## Resultado publicado

O container `workout-supabase-storage` usa `workout-storage:1.74.0-security1`, imagem `sha256:527e41281258698d48648b9d2e6f881956393028f18a09967ec6bc9e2c115e42`. Compose persistido; somente o serviço `storage` foi recriado com `--no-deps --pull never`. Aplicação, dependências da aplicação e migrações foram preservadas, com comparação de hashes das árvores `dist`, `node_modules` e `migrations` em staging.

| Imagem | Críticos | Altos | Médios | Baixos | Decisão |
| --- | ---: | ---: | ---: | ---: | --- |
| Original 1.74.0 | 1 | 72 | 74 | 21 | Substituída |
| Oficial 1.74.5 | 1 | 72 | 74 | 21 | Rejeitada no lote anterior |
| Oficial 1.81.4 | 1 | 52 | 63 | 9 | Avaliada; não publicada |
| 1.74.0-security1 | 0 | 41 | 37 | 4 | Publicada |

Trivy 0.75.0, imagem ARM64 efetiva, scanner de vulnerabilidades, banco atualizado pelo scanner, sem supressões. Os números são ocorrências por pacote/artefato, não vulnerabilidades únicas nem prova de exploração. Não equivalem à ausência de falhas na infraestrutura inteira.

## Alterações e escolha técnica

A imagem oficial mais recente também continha `tar` 7.5.11 no npm global, incluindo o alerta crítico CVE-2026-59873. A atualização 1.81.4 acrescentaria cinco migrações tenant (0070–0074), com mudanças em busca/versionamento, índices e grants. Não foi executada contra banco de produção ou staging.

A imagem publicada deriva da referência imutável da versão já utilizada. Atualiza pacotes Alpine disponíveis e remove npm, npx, Corepack/Yarn, compiladores e Python da camada final. `libstdc++` é mantida explicitamente. O comando original inicia diretamente `node dist/start/server.js`, sem npm. O código e as bibliotecas da aplicação permanecem iguais; não houve atualização manual das dependências JavaScript neste lote.

A receita preserva a base por digest, mas `apk upgrade` consulta os repositórios atuais; uma reconstrução futura exige nova varredura e validação, e não deve ser presumida idêntica à imagem publicada.

## Validação isolada

26 verificações passaram em container candidato numa rede interna de staging, com diretório de arquivos exclusivo e banco de staging existente. Nenhum banco foi parado ou recriado. Cobertura:

- Inicialização saudável e identidade do código, dependências e migrações.
- Bucket privado; upload, recusa de duplicata, download com conteúdo exato e listagem.
- Cópia, movimentação e upsert, com conferência do conteúdo.
- Link assinado e download correspondente.
- Recusa de download privado anônimo e de login sem permissão; upload anônimo recusado.
- Exclusão sem permissão não removeu o objeto; conteúdo permaneceu disponível ao serviço autorizado. A API pode responder lista vazia para exclusão sem objetos visíveis por RLS.
- Histórico de migrações permaneceu idêntico; objetos, bucket e container descartáveis removidos; Storage original de staging preservado.

Verificação adicional do addon nativo `fs-xattr`: gravação/leitura de atributo em arquivo temporário passaram tanto na imagem original quanto na candidata. A primeira sonda usava nomes de método inexistentes (`set/get`) e falhou igualmente nas duas; o teste correto usa `setAttributeSync/getAttributeSync`. Não foi regressão da imagem.

Não houve teste de carga prolongado, transformação de imagens, upload resumível TUS ou protocolo S3 neste lote. Nenhuma mensagem WhatsApp foi enviada e nenhuma chamada paga de IA foi feita.

## Backup, publicação e produção

Backup completo `20261014T000009Z` (21:00 de 13/10 em Brasília), copiado para o computador. Quatro hashes foram calculados independentemente no computador e conferidos antes da troca:

- database.dump: `5078250e59b255cb1372d6141c2c53604238065fd9f8eba34133a9e506f1dce1`
- runtime.tar.gz: `eb2eaa448b04a1a0014e87d88c749c9d6045871cf1e737b5ea4d128735605c04`
- container.before.json: `527d181130d7e7816b72a6cbf3245102bafd3e202a4be1327bd8b8a51da65204`
- compose.before.yml: `8f2293adb0ce5c4e4a53dc6329bc7e6070606216f6454f7c9586428be5e93501`

Backup complementar privado: `C:/Users/pejon/.codex/ssh-workout04/workout-storage-release-backup-20261013.tar.gz`. Contém inspeção com credenciais; manter fora do Git. O backup Supabase inclui banco e arquivos do Storage. O rollback deste lote restaura apenas compose/imagem anterior, sem restaurar banco automaticamente; não precisou ser executado.

Após a troca: Storage healthy, leitura privilegiada de buckets permitida, leitura anônima de alunos recusada e Auth saudável. As chamadas foram feitas pelo gateway público dentro da VM; isso não substitui um novo teste completo da borda pública. Nenhum upload foi feito em produção. Inventário antes/depois: zero buckets e objetos, 3 alunos, 1 usuário e 2 tarefas cron ativas; hash do histórico de migrações inalterado. Nginx, Envoy e Evolution permaneceram saudáveis, com zero reinícios. O npm e Corepack estão ausentes da imagem em execução.

Estado do procedimento: `/home/ubuntu/workout-storage-release-20261013/state.json`, fase `published`. Evidências locais: `C:/Users/pejon/.codex/ssh-workout04/workout-storage-security-evidence-20261013.tar.gz`, SHA256 `a0528ba5680f53ec4101b796bd2d298263e051c434110fffc3749e54fe17d886`.

## Pendências

Os 41 alertas altos restantes estão em dependências da aplicação: `@fastify/busboy`, `@grpc/grpc-js`, `@opentelemetry/propagator-jaeger`, `brace-expansion`, `fast-uri`, `fastify`, `ip-address`, `js-yaml`, `protobufjs` e `undici`. Corrigir em lote próprio com resolução de dependências e testes de compatibilidade; a remoção do npm não resolve esses pacotes. Outros containers da auditoria também continuam pendentes.

Ainda faltam exercício completo de restauração, validação prolongada/carga e observação da primeira execução diária no histórico de automações. Este lote não encerra a auditoria.

Referências: [versão oficial Storage 1.81.4](https://github.com/supabase/storage/releases/tag/v1.81.4), [comparação oficial das versões](https://github.com/supabase/storage/compare/v1.74.0...v1.81.4), [atualização do Supabase self-hosted](https://supabase.com/docs/guides/self-hosting/updating).
