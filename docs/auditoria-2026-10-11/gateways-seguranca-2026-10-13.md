# Gateways: atualização de segurança — 13/10/2026

Publicado Nginx nos dois proxies e Envoy no gateway de API. Nenhuma imagem de Storage, banco, Auth, Realtime, funções ou Evolution foi alterada neste lote.

## Imagens e resultados

| Imagem | Críticas antes/depois | Altas antes/depois |
|---|---:|---:|
| Nginx, usado em dois containers | 2 / 0 | 60 / 0 |
| Envoy | 0 / 0 | 2 / 0 |

Contagens Trivy 0.75.0 por pacote/artefato, em IDs imutáveis, sem comprovação de explorabilidade. Não somar o Nginx duas vezes como vulnerabilidades distintas. A candidata Nginx não teve alertas conhecidos; Envoy ficou com 9 médios e 16 baixos. Isso não representa ausência de falhas de configuração ou vulnerabilidades ainda não conhecidas.

- Nginx atual: `workout-nginx:1.30.5-security1`, ID `sha256:c598465d07202c35b0b8dd2d466510aaa53a148441145c5714b59146b6a1e1b6`. Receita no repositório fixa a imagem oficial por digest e atualiza os pacotes Alpine.
- Envoy atual: `envoyproxy/envoy:v1.39.4`, digest `sha256:74bd4eb5629708d3fadca1a5e6b85d208f338d7bb54e06b69565905c5294cc01`.
- Somente atualizar os pacotes do Nginx 1.28.3 manteve cinco alertas altos no pacote nginx; a candidata foi descartada em favor de 1.30.5.

## Storage: candidata rejeitada

A versão de patch 1.74.5 foi inspecionada e varrida, mas manteve 1 alerta crítico e 72 altos, incluindo tar. Não foi iniciada contra o banco, não executou migrações e não foi publicada. Produção segue na imagem anterior 1.74.0. Será necessário outro lote com revisão de dependências e compatibilidade das migrações; não presumir que atualizar a tag resolva os alertas.

## Staging

22 verificações passaram em rede interna, usando Auth/PostgREST/Storage/Realtime reais do ambiente isolado e um upstream simulado para a Evolution. Somente credenciais fictícias do staging nas configurações finais de teste; configurações e logs temporários são restritos.

Validados:

- Sintaxe dos dois proxies Nginx e inicialização de Envoy com os templates atuais.
- Auth, consulta de banco com service role e recusa de leitura anônima.
- Encaminhamento a uma função Edge fictícia descartável.
- Bucket privado, upload e download do conteúdo exato, recusa de download anônimo.
- Upgrade WebSocket do Realtime através de Nginx e Envoy; não houve publicação de mensagem ou inscrição de negócio.
- Proxy Evolution com chave fictícia, bloqueio sem chave, restrição de método, bloqueio de rota administrativa e limite de corpo de requisição. O teste de payload usou apenas o mock.
- Usuário, bucket, objeto e função descartáveis removidos; containers de QA removidos. Nenhum worker ou banco de staging foi recriado.

A primeira tentativa de Envoy no teste herdava um comando padrão incompatível com o entrypoint customizado. O verificador passou a chamar o entrypoint explicitamente. O teste do proxy Evolution foi ajustado para credencial fictícia, preservando a exigência de autenticação. Produção não foi alterada durante essas tentativas.

## Publicação e backup

Procedimento em `release-gateways.py`: preflight, pausa das duas tarefas cron, espera de workers ociosos, backup, conferência local independente, aplicação, verificação e retomada. Estado final `/home/ubuntu/workout-gateway-release-20261013/state.json`: `resumed`.

Backup Supabase imediatamente anterior `20261013T232921Z`, copiado para `C:/Users/pejon/.codex/ssh-workout04/backups/20261013T232921Z` e verificado:

- database.dump: `a3bd087b1f9454c5b226a3825c325a639e404aeb20abf6f72e6b0c061a7b520a`
- runtime.tar.gz: `73b472cfa95bbcf99c467b3072cf66df4bd2bacde70a6a7d9e6adedd0748e6c1`

Backup complementar restrito `C:/Users/pejon/.codex/ssh-workout04/workout-gateway-release-backup-20261013.tar.gz`: inspeção original dos três containers, compose e configurações dos gateways, incluindo credenciais. Não colocar esse pacote no Git. Hashes internos:

- containers.before.json: `f3455024ba89b90d6aae4da38edb1f37d0db1804ee6fea1b0848002029b71b5a`
- docker-compose.before.yml: `4ed55835d0ffaefeb75ee3d23f87729914deb7838c299e1a583da2cdc35210d8`
- gateway-configs.tar.gz: `391dfeafcf0810bc9973f611b8c0236ae1be0018ee3b0c36f1e5b83b3e4ad42b`
- config-hashes.json: `5db0c17cc15284deedb14e39fe897362779d4451ac2b6e58eff05f3c7c0e60e4`

Compose persistido com as novas referências de imagem; somente serviços api-gw e public-gateway recriados com `--no-deps --pull never`. Proxy Evolution recriado com a configuração original e defaults da imagem nova, preservando volumes de configuração, porta local, rede e autenticação. Container anterior mantido parado para rollback. As configurações de rotas e segredos não foram alteradas. Rollback previsto para imagem e compose, sem restauração automática de banco; não precisou ser executado.

## Conferência em produção

Oito verificações passaram: saúde Auth, banco anônimo recusado, consulta privilegiada permitida, leitura de buckets, bloqueio de administração pelo proxy público, status conectado da Evolution e bloqueios de chave/rota administrativa no proxy Evolution. Essas chamadas do backend foram realizadas pelo proxy público dentro da VM. Chamadas da VM ao domínio público retornavam 403 também no preflight; esse resultado externo isolado não comprovava a autorização dos serviços.

Acesso público adicional conferido pelo navegador autenticado, em aba nova do site: WhatsApp exibiu **Conectado** e operação normal. A aba de teste foi fechada; a aba original do usuário foi preservada. Nenhuma mensagem foi enviada. Captura mantida localmente, fora do Git.

Depois: Envoy e gateway público com healthcheck healthy; proxy Evolution em execução, sem healthcheck próprio. 3 alunos, 1 usuário, 2 tarefas ativas e zero mensagens em processamento. Evolution continuou com a imagem do lote anterior e saudável; Storage permaneceu na imagem anterior e saudável. O histórico de automações continua sem a primeira execução diária e o aviso existente no site permanece visível.

Evidências técnicas locais: `C:/Users/pejon/.codex/ssh-workout04/workout-gateway-security-evidence-20261013.tar.gz`, SHA256 `0fe3833e7f4f277a6929dff4882cd0ca73c92a1cc5d78202b4d344ed625d1ab1`. Incluem varreduras das candidatas rejeitadas, receita e resumos. Configurações sensíveis e logs de requests não foram incluídos no relatório público.

## Próximo lote

Storage e os demais containers ainda têm alertas pendentes. Atualização de banco e migrações deve ter validação própria. Um exercício completo de restauração e testes de carga prolongada continuam pendentes.

Referências: [avisos Nginx](https://nginx.org/en/security_advisories.html), [versões Envoy](https://github.com/envoyproxy/envoy/releases), [versões Storage](https://github.com/supabase/storage/releases).
