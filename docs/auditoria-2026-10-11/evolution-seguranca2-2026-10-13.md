# Evolution: segundo lote de segurança — 13/10/2026

Publicado na mesma instância, preservando licença, configuração, banco e volumes de sessão. Imagem atual `workout-evolution:0.7.2-security2`, ID `sha256:11f42613e1f88a396c09c34d28f04460fda2b98af1ba471710349820ae331727`.

## Mudanças

- Go 1.26.9, base de compilação Alpine 3.23 fixada por digest.
- Base de execução Alpine 3.23, com atualização de pacotes e instalação explícita das ferramentas de mídia. O manager compilado e VERSION foram copiados da imagem anterior.
- WebP 1.4.0, x/image 0.45.0, x/net 0.60.0. A resolução compatível selecionou x/crypto 0.57.0 e x/text 0.42.0; tentar fixar apenas os mínimos dos avisos gerava conflito entre requisitos dos módulos.
- pgx 5.9.2 e RabbitMQ 1.13.0 preservados.
- Healthcheck HTTP adicionado à imagem, sem envio de mensagem ou alteração de sessão.
- Código de pool, configuração e licença conferido por hash contra o código anterior: sem alterações.

## Comparação da varredura

Trivy 0.75.0, IDs imutáveis, scanner de vulnerabilidades, mesma base/cache da rodada anterior. Contagens por pacote/artefato, sem comprovação de explorabilidade.

| Severidade | Antes do lote | Depois |
|---|---:|---:|
| Crítica | 0 | 0 |
| Alta | 15 | 0 |
| Média | 39 | 1 |
| Baixa | 18 | 0 |
| Desconhecida | 9 | 1 |

Isso se aplica somente à imagem da Evolution; os alertas das demais imagens da stack continuam pendentes.

### Alertas restantes

- CVE-2026-107386 em amqp091-go 1.13.0, severidade média; scanner aponta correção 1.14.0. Nesta configuração, AMQP_URL está vazio, integração global desabilitada e a única instância não tem integração RabbitMQ habilitada. A ocorrência continua registrada e deve ser corrigida antes de ativar essa integração; não foi criada supressão.
- GO-2026-5932 em x/crypto, severidade desconhecida, relativo ao pacote openpgp sem manutenção. `go list -deps ./cmd/evolution-go`, executado no builder sem rede, não inclui `golang.org/x/crypto/openpgp`. A presença do módulo no binário não demonstra uso desse pacote. Não foi removida a dependência nem suprimido o alerta.

## Testes

Quatro grupos Go passaram com execução nova e saída detalhada: utils, message/repository, sendMessage/service e whatsmeow/service. Nenhum teste ignorado ou falho nos grupos executados. O Poppler foi instalado no builder para executar o teste de renderização PDF, que antes poderia ser ignorado quando a ferramenta não existisse.

Novo teste `workout_media_security_test.go`, copiado para o pacote sendMessage/service da Evolution: chama a conversão PNG para WebP contra servidor HTTP local e confirma dimensões pelos decodificadores CGO e Go. Ambos passaram. O teste não chama WhatsApp e não usa dados reais. O artefato versionado foi formatado por gofmt depois da execução, sem alteração da lógica.

Staging: 19 verificações passaram com banco descartável, rede interna e ausência de volumes de produção. Incluem inicialização, migrações PostgreSQL, versões compiladas, geração de PNG pelo ffmpeg e healthcheck Docker. Recursos de QA removidos. As rotas operacionais continuaram bloqueadas pela licença inativa no staging; essa etapa não validou acesso operacional autenticado.

## Publicação e conferência

Usado `release-security.py --second`, com preflight, pausa das duas tarefas cron, espera por workers ociosos, parada da única Evolution, backup, conferência local independente, troca e retomada. Não houve dois processos usando a sessão simultaneamente.

Estado final `/home/ubuntu/workout-evolution-release2-20261013/state.json`: `resumed`.

Com a ativação legítima da instância existente, verificados:

- Licença ativa e uma instância preservada.
- WhatsApp conectado e autenticado depois da inicialização normal.
- Consulta administrativa HTTP 200; sem chave ou chave incorreta HTTP 401.
- Imagem em execução corresponde ao ID analisado; healthcheck `healthy`.
- Duas tarefas cron retomadas; 3 alunos e 1 usuário preservados, zero mensagens em processamento na conferência.
- Container anterior `evolution-go-previous-security2-20261013` mantido parado para rollback. Nenhum restore de banco foi executado.

Não houve envio de teste, pareamento, logout ou chamada paga de IA. Entrega real após atualização e estabilidade sob carga prolongada não foram testadas.

## Backups e evidências

Backup específico, contendo dados sensíveis, fora do Git: `C:/Users/pejon/.codex/ssh-workout04/evolution-security2-backup-20261013.tar.gz`. Hashes dos arquivos internos conferidos antes da troca:

- evogo_auth.dump: `43ebd81489906358e51b3136fb80ca752cc7ab05cf85ba1d75800af6012d0446`
- evogo_users.dump: `8055669e05730cdd2a87a31ca7ee80d050efe1444718fc0c9baf7a4952aac83d`
- volumes.tar.gz: `9fc9058d6239696dcf2f727a5d54da6a95d52b0a3d1c54f9bf51d5bf7a39cfaf`
- container.before.json: `8a26f44542042e52cc8b3472d17237b1e369d36455e8be99d48b0e3a7388c901`

Evidências técnicas: `C:/Users/pejon/.codex/ssh-workout04/evolution-security2-evidence.tar.gz`, SHA256 `d406fa390a409b81b70601eeb6684a3f7b0f32afb623f4d943e0548a06a5e3a7`. Incluem receita, go.mod/go.sum efetivos, build-info, logs de build, relatório completo do scanner, análise de dependências e resumo de publicação. Logs de staging e configuração de produção não foram incluídos no relatório público.

Receita no repositório: `ops/evolution-go/Dockerfile.security2`. Usar no contexto da cópia completa e revisada da Evolution; copiar também o teste de mídia para `pkg/sendMessage/service/`. Este repositório não contém o código completo do provedor. A base está fixada por digest, mas apk e resolução Go podem mudar em um rebuild futuro; preservar os módulos efetivos e o ID publicado junto com as evidências.

Referências: [WebP](https://github.com/advisories/GHSA-j7hp-h8jx-5ppr), [Go 1.26.9](https://go.dev/doc/devel/release#go1.26.9).
