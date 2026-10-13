# Candidata de segurança da Evolution — 13/10/2026

**Atualizada na instância existente em produção.** A validação isolada descrita abaixo permaneceu parcial; a validação autenticada foi concluída durante a troca controlada, preservando a ativação existente. Consulte a seção de publicação ao final.

Imagem: `workout-evolution:0.7.2-security1`, ID `sha256:8e1022c8b5ed34eede17d9449329fc330c746439d3844d51f2d1bd0be518665a`.

## Alterações

- Go 1.25.0 para 1.25.14.
- pgx 5.5.5 para 5.9.2, com resolução de pgservicefile e puddle.
- amqp091-go 1.10.0 para 1.13.0.
- Base de execução anterior preservada por digest; binário e metadados substituídos.
- SHA256 de whatsmeow/service, config/config.go e core/c0.go conferido contra o código anterior: sem mudanças. Preservadas as duas chamadas ao pool compartilhado e os limites de conexões.

O repositório contém a receita `ops/evolution-go/Dockerfile.security`, o patch dos módulos e o verificador de staging. O código completo da Evolution está na cópia privada da VM. O build final usou uma camada intermediária local da primeira compilação para reaproveitar caches, com o mesmo Go 1.25.14. Seu ID está nas evidências. O builder padrão da receita está fixado por digest; o build padrão do zero não foi repetido depois dessa otimização.

## Validação e limites

Quatro grupos de testes passaram com `-count=1`: utils, message/repository, sendMessage/service e whatsmeow/service. Binário compilado com sucesso. Esses testes não demonstram entrega real ou estabilidade prolongada de reconexão.

Staging: rede interna sem acesso externo, PostgreSQL descartável em tmpfs, chave fictícia e nenhum volume de produção. A primeira tentativa por porta publicada não alcançou a rede interna; o verificador passou a chamar HTTP dentro do container. Recursos temporários removidos após as tentativas.

A execução final passou em 15 verificações: inicialização HTTP, leitura do status de licença, bloqueio das rotas operacionais, migrações PostgreSQL, ausência de instâncias WhatsApp, versões compiladas, rede e volumes. **A licença estava inativa: as rotas operacionais retornaram 503 por licença, inclusive com chave administrativa fictícia. Isso não valida autenticação ou operação depois da ativação.** A licença não foi copiada, modificada nem contornada.

## Comparação da varredura

Trivy 0.75.0, mesma base de dados/cache e mesmos parâmetros, imagens por ID imutável. São ocorrências por pacote/artefato, sem comprovação de explorabilidade.

| Severidade | Produção atual | Candidata |
|---|---:|---:|
| Crítica | 6 | 0 |
| Alta | 43 | 15 |
| Média | 61 | 39 |
| Baixa | 21 | 18 |
| Desconhecida | 9 | 9 |

Permanecem 15 ocorrências altas para triagem. Zero alertas críticos não significa ausência de vulnerabilidades.

## Evidências e produção

Evidências na VM: `/home/ubuntu/workout-evolution-security-20261013/`. Cópia local: `C:/Users/pejon/.codex/ssh-workout04/evolution-security-evidence.tar.gz`, SHA256 `f956e368412c9700cc0f026fd0ef7916f12196deab35f20445ae06ee4b463621`.

Incluem build-info, go.mod/go.sum efetivos, hash do código, receita, relatório de staging e resumo do scanner. Logs de staging são restritos e não publicados porque podem conter credenciais fictícias.

Produção conferida ao final: imagem anterior `sha256:e8ed22400352063d8d134d70b388c4ce582c6464fc35a58706b2830770a6bba8` preservada e processo em execução. Containers de QA removidos. Nenhum envio, reconexão, logout, pareamento ou uso de sessão real nesta etapa.

## Pendência antes da troca

Validar rotas operacionais com ativação legítima da licença em homologação. Preparar backup específico da Evolution (banco e volumes de sessão), pausa da fila, troca controlada e rollback. O backup Supabase não substitui esse backup.

Referências: [pgx 5.9.2](https://github.com/jackc/pgx/security/advisories/GHSA-j88v-2chj-qfwx), [RabbitMQ 1.13.0](https://github.com/rabbitmq/amqp091-go/releases/tag/v1.13.0), [Go TLS](https://pkg.go.dev/vuln/GO-2026-4337).

## Publicação na mesma instância

A documentação oficial confirma persistência da ativação em `runtime_configs`: https://github.com/evolution-foundation/evolution-go#license-activation . Não foi encontrada regra explícita de homologação; não foi criada outra ativação. A atualização preservou banco, configuração e volumes da instância existente.

Procedimento em `ops/evolution-go/release-security.py`, com fases explícitas. Estado final `/home/ubuntu/workout-evolution-release-20261013/state.json`: `resumed`.

1. Preflight confirmou imagem anterior, licença ativa, WhatsApp conectado e uma instância.
2. Pausadas as duas tarefas cron; aguardados fila em processamento, lease e requisições de automação ficarem ociosos.
3. Evolution parada por breve janela. Backups específicos dos bancos `evogo_auth` e `evogo_users`, volumes de dados/sessão e logs, além da configuração original do container. Copiados para a máquina local; hashes conferidos independentemente antes de aplicar.
4. Container anterior renomeado e desconectado da rede para evitar duplicidade de DNS ou sessão. Novo container criado com a imagem candidata e a configuração original; mesmos volumes, porta local, ambiente e rede. Nunca houve dois processos Evolution usando a sessão simultaneamente.
5. Verificada licença ativa, uma instância preservada, consulta administrativa HTTP 200 e WhatsApp conectado/autenticado. Sem chave e com chave incorreta: HTTP 401. Tarefas retomadas e conferidas: duas ativas.

Backup local restrito: `C:/Users/pejon/.codex/ssh-workout04/evolution-security-backup-20261013.tar.gz`. O pacote contém credenciais e sessão; não deve ser colocado no Git.

Hashes dos arquivos internos:
- evogo_auth.dump: `de3c7fc20c73dd71a0437ee133d84ac875a0b892f0bb4990730858a6a4a6007b`
- evogo_users.dump: `bb5572cb935f4e82c7cc19384d1874e18bd097e06a24172d01bae169e91874f5`
- volumes.tar.gz: `af0c23ff45a14e6094b118b8fda07d1e175e46658fed092fff23742c684cbc79`
- container.before.json: `7a15fd3b89f2e6e7746f823d4829af3878ce7a26b750ec6ed1c4d2d8e175cb5d`

Container anterior mantido parado: `evolution-go-previous-security-20261013`. O rollback do script retorna à imagem anterior e só retoma tarefas após conexão/ativação verificadas; não restaura banco automaticamente. Não foi executado rollback ou restauração nesta publicação.

Conferência posterior: 3 alunos, 1 usuário de autenticação, nenhuma mensagem em processamento. Evolution em execução, alias de rede preservado. Amostra das conexões PostgreSQL: duas em evogo_auth e uma em evogo_users; isso não demonstra ausência de vazamento sob carga prolongada. `automation_runs` continua sem registros; execução diária natural segue pendente.

Nenhuma mensagem de teste, pareamento, logout ou chamada paga de IA. A sessão existente reconectou como parte da inicialização normal. Entrega real de mensagem depois da troca e estabilidade prolongada ainda não foram testadas. Permanecem 15 alertas altos na imagem atual para triagem.
