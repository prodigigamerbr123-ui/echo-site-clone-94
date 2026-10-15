# Varredura atual dos containers — 14/10/2026

> Continuidade publicada: PostgREST security1 tem zero críticos/altos, 37 médios/quatro baixos, com 41 checks isolados/17 em produção. A mesma base Trivy contou cinco críticos/172 altos na imagem original. Ver [entrega PostgREST](postgrest-seguranca-2026-10-14.md). Os números da tabela abaixo continuam como fotografia anterior; Storage e pooler também foram atualizados posteriormente.

> Atualização posterior: pooler security1 publicado após revisão dos alertas residuais, endurecimento do runtime, 32 verificações isoladas, backup e restauração de metadados. Ver [publicação de 14/10](pooler-publicacao-2026-10-14.md). Os estados de candidata/bloqueio abaixo preservam a fotografia anterior.

> A tabela registra o snapshot anterior à troca do Storage neste dia. Depois desta varredura, security2 foi validada e publicada com zero críticos/altos e 25 médios; ver `storage-seguranca-2026-10-14.md`. As outras imagens não foram alteradas por esse lote.

## Escopo e evidências

Varredura efetiva das 15 imagens distintas de 16 containers de produção, por ID imutável, usando Trivy 0.75.0. Inventário antes/depois confirmou imagens inalteradas. Nenhum serviço foi reiniciado ou atualizado por esta varredura. Scanner serial com prioridade de CPU reduzida; apenas vulnerabilidades, sem supressões.

O comando solicitou atualização do banco; o cache ainda era válido e foi reutilizado: UpdatedAt 2026-10-13T19:11:46Z, DownloadedAt 2026-10-13T22:11:49Z, NextUpdate 2026-10-14T19:11:46Z. Não se afirma que os advisories tenham sido baixados novamente em 14/10. A comparação antes/depois da candidata deve usar esse mesmo snapshot.

Dados resumidos na tabela abaixo; o inventário JSON é evidência local excluída do Git pelas regras de proteção dos inventários operacionais. Relatórios completos fora do Git, na VM em `/home/ubuntu/workout-runtime-20261014` e cópia local `C:/Users/pejon/.codex/ssh-workout04/runtime-scan-20261014/reports.tar.gz`, SHA256 `7b336012cda377b1fe9c3ecb0dea81d466e7d126369ccdc452585f4d5550959c`. O script `ops/supabase-self-hosted/scan-runtime.py` guarda somente campos selecionados do inventário, sem Config.Env.

## Resultado antes do próximo lote

| Container(s) | Críticos | Altos | Críticos/altos com versão corrigida no scanner |
| --- | ---: | ---: | ---: |
| workout-supabase-storage | 0 | 41 | 41 |
| workout-supabase-edge-functions | 4 | 59 | 11 |
| workout-supabase-studio | 21 | 417 | 168 |
| workout-supabase-auth | 0 | 30 | 29 |
| realtime-dev.supabase-realtime | 3 | 139 | 59 |
| workout-supabase-meta | 9 | 93 | 50 |
| workout-supabase-pooler | 26 | 727 | 1 |
| workout-supabase-rest | 5 | 171 | 154 |
| workout-supabase-db | 0 | 48 | 48 |
| workout-supabase-imgproxy | 0 | 27 | 27 |
| evolution-cloudflared | 0 | 6 | 6 |
| evolution-postgres | 1 | 24 | 25 |
| evolution-go | 0 | 0 | 0 |
| workout-supabase-public, evolution-api-gateway | 0 | 0 | 0 |
| workout-supabase-envoy | 0 | 0 | 0 |

Totais: 69 ocorrências críticas e 1782 altas. São ocorrências por pacote/artefato, não CVEs únicos nem prova de exploração. Uma mesma falha pode aparecer em imagens/pacotes diferentes. Versão corrigida de pacote não implica imagem pronta e compatível.

## Triagem e limites

- Storage mantém 41 altos, todos com correção de pacote indicada. Próximo lote prepara dependências corrigidas sem migrar schema ou trocar código da aplicação. A imagem em produção não foi alterada pela varredura.
- Evolution e Nginx permanecem sem altos/críticos; Envoy também, com alertas médios/baixos residuais. Isso é resultado do scanner e não uma garantia de ausência de falhas.
- Supavisor conserva base Debian 11.11, classificada EOSL pelo scanner. A atualização/reconstrução do pooler precisa de validação própria; não executar upgrade automático de PostgreSQL em consequência.
- A listagem de nomes de processos do pooler mostrou Erlang/BEAM e auxiliares; não mostrou daemon Exim. Studio executa Next.js e Meta executa Node. Essa fotografia reduz dúvidas sobre processos ativos, mas não demonstra que cada biblioteca vulnerável seja inalcançável. O LTS Debian 11 terminou em 31/08/2026 conforme a fonte primária citada abaixo.
- Studio/Meta e demais serviços ainda exigem triagem de exposição e alcance. Não classificar toda ocorrência em pacote instalado como ataque possível pela internet.
- Alertas antigos em contrib/minizip, cabeçalhos de kernel e componentes sem processo ativo devem ser analisados individualmente; nenhuma supressão global foi aplicada.
- Java DB não foi atualizado; não afirmar cobertura Java completa. Não foram varridos kernel do host, filesystem gravável, malware, segredos ou configuração completa.
- Portas de host observadas continuam ligadas a 127.0.0.1, mas proxies/túneis podem expor rotas. Inventário não equivale a pentest da borda.

## Fontes primárias para continuidade

- [Atualizações do Supabase self-hosted](https://supabase.com/docs/guides/self-hosting/updating).
- [Debian Bullseye](https://www.debian.org/releases/bullseye/).
- [Releases do Storage](https://github.com/supabase/storage/releases).

O lote de dependências do Storage terá relatório próprio com decisão, testes, imagem imutável e publicação ou rejeição.

## Continuidade do pooler

O pooler foi reavaliado com uma base Trivy mais recente: 26 críticos/731 altos na imagem de produção inalterada. Candidata Debian 13: zero críticos/48 altos, 14 verificações funcionais, publicação bloqueada pela análise de segurança pendente. A tabela acima permanece como snapshot histórico. Ver [relatório do pooler](pooler-candidata-2026-10-14.md).
