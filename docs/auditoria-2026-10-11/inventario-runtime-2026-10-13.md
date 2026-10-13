# Inventário de runtime — 13/10/2026

Inspeção somente de leitura via Docker na VM. Nenhum container reiniciado ou atualizado nesta etapa. Inventário não equivale a varredura de vulnerabilidades.

| Serviço | Imagem configurada | Saúde Docker |
|---|---|---|
| Edge | supabase/edge-runtime:v1.76.2 | healthy |
| Gateway público | nginx:1.28-alpine | healthy |
| Envoy | envoyproxy/envoy:v1.39.1 | healthy |
| Storage | supabase/storage-api:v1.74.0 | healthy |
| Studio | supabase/studio:2026.09.07-sha-7996410 | healthy |
| Auth | supabase/gotrue:v2.196.0 | healthy |
| Realtime | supabase/realtime:v2.134.10 | healthy |
| Meta | supabase/postgres-meta:v0.99.0 | healthy |
| Pooler | supabase/supavisor:2.9.12 | healthy |
| REST | postgrest/postgrest:v14.17 | healthy |
| Banco principal | supabase/postgres:17.6.1.136 | healthy |
| Imagens | darthsim/imgproxy:v3.31.4 | healthy |
| Evolution | workout-evolution:0.7.2-pool25 | sem healthcheck |
| Túnel | cloudflare/cloudflared:latest | sem healthcheck |
| Gateway Evolution | nginx:1.28-alpine | sem healthcheck |
| Banco Evolution | postgres:16-alpine | sem healthcheck |

Todos os 16 containers de produção estavam em execução e com política de reinício `unless-stopped`. Os 12 containers principais com healthcheck reportaram healthy. Os quatro sem healthcheck não podem ser classificados como saudáveis apenas por estarem em execução.

## Reprodutibilidade

As imagens em execução possuem digests identificáveis, mas diversas referências configuradas permitem mudanças sem alteração do compose (`latest`, `16-alpine`, `1.28-alpine`). Registrar e fixar os digests na configuração deve ser feito depois de localizar os arquivos efetivamente usados e validar o processo de atualização e rollback. Não foi aplicado compose up nesta revisão.

O código Deno importa `https://esm.sh/@supabase/supabase-js@2`, uma referência que permite atualizações dentro da versão principal. O arquivo local `deno.lock`, ainda não versionado, registra resolução para 2.117.3. Isso não demonstra qual versão o cache do Edge de produção executa. Antes de fixar a versão, extrair a resolução real e validar todas as funções em staging; não substituir automaticamente pela versão do frontend nem presumir que o lock local seja usado pela VM.

Os imports HTTP da biblioteca padrão usam versão explícita 0.190.0; o lock local também contém entradas antigas 0.168.0. A presença no lock não prova uso efetivo no runtime atual.

## Pendências desta etapa

- Scanner de imagens: Trivy não encontrado no PATH da VM. Não foi realizada análise de pacotes das imagens; não há conclusão de ausência ou presença de CVEs Docker.
- Auditar dependências Deno separadamente da auditoria npm.
- Definir healthchecks efetivos dos serviços Evolution, sem envio de mensagens nem alterações de sessão.
- GitHub: tentativa de push do commit 716b525 falhou por ausência de credencial no Git local; conexão GitHub anterior indisponível nesta sessão. Solicitada reconexão ao usuário. Backend já publicado na VM; workflow novo permanece local.
