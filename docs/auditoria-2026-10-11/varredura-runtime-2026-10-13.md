# Varredura de imagens e dependências Deno — 13/10/2026

## Escopo e execução

Trivy v0.75.0 obtido do release oficial aquasecurity/trivy para Linux ARM64, checksum do arquivo conferido contra checksums.txt do mesmo release. Isso verifica integridade em relação ao release, sem verificação adicional de assinatura.

Analisadas as 15 imagens distintas usadas pelos 16 containers de produção. Scanner executado contra IDs imutáveis locais com `image --image-src docker --scanners vuln --parallel 1 --skip-java-db-update`, prioridade de CPU reduzida. Todas as 15 análises retornaram código zero. Nenhum container de serviço foi reiniciado ou atualizado; nenhum envio de mensagem ou chamada de IA foi realizado.

Relatórios completos e logs preservados fora do repositório em `C:/Users/pejon/.codex/ssh-workout04/runtime-scan-20261013/reports.tar.gz` e na VM em `/home/ubuntu/workout-security-scan`. SHA256 do arquivo local: `bc41708c4a99c3b488f62b8c4e00d886210c3b125856da122b8ecffae4263f76`.

## Resultado bruto por imagem

Contagens são ocorrências de vulnerabilidade por pacote/artefato, sem deduplicação e sem comprovação de explorabilidade. A mesma CVE pode aparecer várias vezes. “Com correção” significa que o banco do scanner informa uma versão corrigida de pacote; não demonstra existir imagem de fornecedor pronta e compatível.

| Imagem | Críticas | Altas | Críticas/altas com versão corrigida |
|---|---:|---:|---:|
| supabase/edge-runtime:v1.76.2 | 4 | 59 | 11 |
| nginx:1.28-alpine | 2 | 60 | 62 |
| envoyproxy/envoy:v1.39.1 | 0 | 2 | 2 |
| supabase/storage-api:v1.74.0 | 1 | 72 | 72 |
| supabase/studio:2026.09.07-sha-7996410 | 21 | 417 | 168 |
| supabase/gotrue:v2.196.0 | 0 | 30 | 29 |
| supabase/realtime:v2.134.10 | 3 | 139 | 59 |
| supabase/postgres-meta:v0.99.0 | 9 | 93 | 50 |
| supabase/supavisor:2.9.12 | 26 | 727 | 1 |
| postgrest/postgrest:v14.17 | 5 | 171 | 154 |
| supabase/postgres:17.6.1.136 | 0 | 48 | 48 |
| darthsim/imgproxy:v3.31.4 | 0 | 27 | 27 |
| workout-evolution:0.7.2-pool25 | 6 | 43 | 49 |
| cloudflare/cloudflared:latest | 0 | 6 | 6 |
| postgres:16-alpine | 1 | 24 | 25 |

## Triagem inicial e prioridades

1. Evolution possui alertas em dependências Go compiladas: pgx v5.5.5 (scanner indica 5.9.0), amqp091-go v1.10.0 (indica 1.13.0) e stdlib Go1.25.0 (correções a partir de1.25.7 dentro dessa série para CVE-2025-68121). A presença no binário não comprova que funções vulneráveis sejam alcançadas. Rebuild deve preservar o patch de pool existente e passar por staging; conferir se integração RabbitMQ é usada antes de atribuir exposição.
2. Storage inclui node-tar7.5.11, CVE-2026-59873, versão corrigida7.5.19 segundo scanner. Confirmar caminho de uso antes de declarar exploração por upload. Advisory: https://github.com/advisories/GHSA-23hp-3jrh-7fpw . Não alterar node_modules dentro de container em execução.
3. Edge, Realtime, Studio e Meta incluem alertas de pacotes do sistema operacional. Preferir imagem de fornecedor corrigida ou rebuild reproduzível testado, sem atualização simultânea de toda a stack.
4. Pooler tem base Debian11 e muitos pacotes auxiliares; alerta em exim não prova que daemon esteja ativo. Requer inventário de processos e rotas, depois atualização validada. Não fazer upgrade de banco por consequência automática da varredura.

## Limitações e falsos positivos possíveis

- Debian classifica CVE-2023-45853 em zlib de bookworm como ignorada porque contrib/minizip não é compilado no pacote: https://security-tracker.debian.org/tracker/CVE-2023-45853 . Não contabilizar esse alerta isoladamente como exploração confirmada do site. Nenhuma supressão global foi criada.
- Há alertas descritos como específicos de builds32bits; a VM é ARM64. Confirmar arquitetura do binário/biblioteca e advisory antes de descartar cada ocorrência. Exemplo Perl: https://ubuntu.com/security/notices/USN-8467-1 . A origem da severidade do scanner pode diferir da avaliação do fornecedor.
- PostgREST traz alertas em linux-libc-dev: cabeçalhos dentro de uma imagem não demonstram que o kernel vulnerável esteja em execução no host. O kernel do host não foi varrido por esta análise.
- Scanner examina pacotes presentes, incluindo ferramentas de build/desenvolvimento e código possivelmente não usado. Não foi realizada prova de exploração.
- JavaDB não foi atualizado nesta rodada; não afirmar cobertura de dependências Java. Não foram analisados segredos, malware, configurações completas ou filesystem gravável dos containers.

## Superfície observada

Portas publicadas pelos containers de produção limitadas a127.0.0.1. Isso não impede exposição por proxy/túnel. Gateway público permite os prefixos auth/rest/storage/realtime/functions v1 e encaminha ao gateway interno; Studio/Meta não possuem porta de host publicada nem rota explícita nesse gateway público. Não foi realizado pentest de todas as rotas.

## Dependências Deno

O cache remoto do Edge em produção contém supabase-js/auth-js/functions-js/postgrest-js/realtime-js/storage-js2.117.3 e phoenix0.4.5. O grafo local de ai-assistant resolve supabase-js2.117.3 e iceberg-js0.8.1. Presença no cache não é tracing de cada worker em execução.

Auditoria separada da distribuição npm `@supabase/supabase-js@2.117.3`, em pasta temporária privada e sem scripts de instalação: zero vulnerabilidades conhecidas no grafo resolvido pelo npm (10 pacotes contabilizados no relatório). Esse teste não cobre integralmente o bundle esm.sh, a biblioteca padrão deno.land ou o runtime Deno. Nenhuma alteração de versão foi publicada. Os imports @2 continuam variáveis e devem ser fixados em lote testado, com lock usado pelo processo real de publicação.

## Próxima correção proposta

Preparar rebuild da Evolution com dependências corrigidas, preservando o patch do pool; validar em staging e medir redução de alertas. Depois tratar Storage/gateways e imagens Supabase em lotes pequenos com backup e rollback. Esse planejamento não representa atualizações já aplicadas.
