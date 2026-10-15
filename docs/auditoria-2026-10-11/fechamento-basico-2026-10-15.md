# Rodada de fechamento básico — 15/10/2026

Escopo: itens 2 em diante da tabela de continuidade, por solicitação do proprietário. Rotação das demais credenciais ficou fora deste lote. Sistema interno de academia pequena; não afirmar ausência absoluta de bugs ou vulnerabilidades.

## Infraestrutura publicada

Nova varredura de 15 imagens/16 containers, com base atualizada pelo scanner e relatórios privados em `/home/ubuntu/workout-runtime-closeout-20261015`. Nenhum segredo de ambiente foi incluído no inventário. Imagens permaneceram inalteradas durante a varredura.

| Serviço | Antes: críticos/altos | Depois: críticos/altos | Imagem publicada |
| --- | --- | --- | --- |
| PostgreSQL Workout | 0 / 48 | 0 / 0 | `e3b542a8c61bd2e8c01d571492444926781052fb1f6f9b6e28831cc74c65ba4a` |
| PostgreSQL Evolution | 1 / 24 | 0 / 0 | `407aceeb08fb1f80aec21a69ac4da39d053d43c12fa0eb0fb4de39ff96ee218b` |
| Edge Runtime | 4 / 59 | 1 / 51 | `af6f2466bc913b9cc9ccf7c08e5a682aaf3b37b4f55e46024301dd832486a000` |
| Realtime | 3 / 141 | 0 / 79 | `2a17f9cabeb851662f9cb4734a94453fc5376f70f08ff72fe77433663cc8a0de` |
| Cloudflared | 0 / 6 | 0 / 0 | `72c857182dff414bf76543503d8868341eac2dbab8ecf2ab659231124ef7c9b0` |

Mesmos executáveis PostgreSQL e Edge conferidos por SHA256. Alterações: bibliotecas de runtime e gosu 1.19 recompilado com Go 1.26.9. Não houve migração de versão/formato do banco nem troca de senha.

Validação: restauração integrada com candidatas, tentativa 7, 39 verificações; restauração dos três bancos Evolution, tentativa 3, contagens/reinício/cleanup; Realtime com saúde HTTP do tenant antes/depois de reinício isolado. Em produção, dez verificações de imagens, configuração, dados/senhas/funções e preservação de mounts/ambiente/restart da Evolution, mais 25 verificações operacionais. Nenhum envio ou chamada de IA. Retorno preparado, não acionado.

Backup anterior `20261015T193442Z`, posterior às quatro imagens `20261015T194159Z`; cinco arquivos copiados e SHA256 conferido. Ambos foram executados pelo próprio serviço systemd de backup, sob demanda. O disparo natural pelo timer após as ampliações Deno/Evolution ainda aguarda a madrugada de 16/10.

Imagens exportadas: `C:/Users/pejon/.codex/ssh-workout04/remaining-runtime-20261015/runtime-images.tar.gz`, 1.023.587.682 bytes, SHA256 `ffead52654d55c3a33658c5612731cd8e733919b61caa7fba6099719769f05e4`; 71 blobs OCI conferidos individualmente. Não confundir imagem com backup de dados.

## Serviços opcionais e riscos residuais

Imgproxy deixou de executar por padrão: perfil `images`, restart `no`, transformação desabilitada no Storage e dependência removida. Sem chamadas de Storage/transformação encontradas no aplicativo, nenhum objeto real registrado; o ensaio integrado já comprovou upload/download com transformação desativada e sem imgproxy. Storage normal continua saudável. Imagem antiga com 27 altos preservada, não corrigida. Studio/Meta continuam sob demanda, também sem corrigir suas imagens antigas.

Edge mantém 1 crítico de versão em zlib1g, CVE-2023-45853. O [Debian](https://security-tracker.debian.org/tracker/CVE-2023-45853) registra que contrib/minizip não é compilado nos binários Bookworm dessa versão. O alerta bruto não foi suprimido; a classificação de versão não demonstra exploração desse runtime. Alertas de ncurses incluem falha no utilitário CLI infocmp, classificada pelo [Debian como problema menor](https://security-tracker.debian.org/tracker/CVE-2025-69720).

Edge/Realtime atualizados não têm críticos/altos com versão corrigida indicada pelo scanner nessa base, mas os demais altos permanecem abertos: ausência de correção indicada não prova ausência de risco. Auth conserva um alto de versão e pooler 48 altos revisados, conforme relatórios próprios. Não declarar segurança integral encerrada.

Cloudflared 2026.10.0 recompilado do commit oficial `18cdfe0a6fc7b72a0702d255a1f984e776ce0498`, Go 1.26.9 e x/net 0.60.0, runtime Alpine atualizado: zero críticos/altos/médios/baixos e um desconhecido. Configuração validada sem rede; segundo conector do mesmo túnel ficou pronto e reiniciou antes da troca. Saúde pública Auth passou após parar o anterior. Rotas, ambiente e binds preservados; nenhuma credencial, rota ou permissão nova. Imagem local: `cloudflared-image.tar.gz`, 25.251.194 bytes, SHA256 `5938417430cb8fb432c0500a003055c3227995f68ee7e88dea294f9c54c1e6ca`, cinco blobs OCI conferidos. Os containers anteriores de PostgreSQL Evolution e Cloudflared ficaram parados com restart `no`, inclusive para impedir dois bancos sobre o mesmo volume após reiniciar Docker.

Varredura final dos 16 nomes de produção em `/home/ubuntu/workout-runtime-final-20261015`: imagens inalteradas durante a leitura; base Trivy UpdatedAt `2026-10-15T13:13:18Z`, DownloadedAt `2026-10-15T16:19:31Z`. Nos serviços ativos: um crítico de versão zlib acima e 179 ocorrências altas, zero críticos/altos com correção indicada nessa base. São ocorrências por pacote, não ataques comprovados. Studio/Meta/imgproxy desligados conservam alertas e exigem nova revisão antes de habilitar.

Snapshot final **20261015T195613Z**, cinco arquivos copiados/hashes conferidos. Restauração integrada repetida: tentativa 8, 39 verificações, 18,97 s com imagens prontas. Evolution: tentativa 4, 18 tabelas/323.701 registros + quatro tabelas/cinco registros + banco vazio, contagens iguais, reinício e cleanup aprovados, provedor não iniciado. A contagem Evolution pode crescer pelo funcionamento normal do provedor; isso não indica novos envios de auditoria.

## Monitoramento e fila

Instalados `operational-health.py`, serviço e timer de cinco minutos. Relatório privado `/var/lib/workout-monitor/latest.json`; saída e falhas em `journalctl -u operational-health.service`. **27 verificações aprovadas**, incluindo containers essenciais, política do imgproxy, conexão/login da Evolution, fila atrasada/em envio, duplicidade de recibos, jobs ativos, execução recente, resposta HTTP recente de pg_net, automação diária, backup completo/recente, timer, espaço em disco e containers de retorno dormentes.

O último HTTP de pg_net não é correlacionado individualmente ao job; complementa as outras verificações. O monitor confere manifesto/tamanhos/idade do backup, sem recalcular hashes grandes a cada cinco minutos. Backup e sincronização fazem essa validação. Falhas locais não notificam fora da VM; monitor externo/backup independente dependem de destino e responsável.

Fila observada: 19 enviados, 35 falhos, quatro cancelados; zero pendentes/processando, zero recibos duplicados ou falhas com recibo de sucesso no banco. Nenhum falho possui dispatch_started_at. Isso não prova não entrega histórica quando faltam recibos do provedor. Os 35 foram preservados; não houve repetição, cancelamento ou limpeza automática. Conferência individual continua necessária caso se pretenda reenviar.

## Interface e correções funcionais

- Diálogos normais e de confirmação agora têm altura máxima baseada no viewport dinâmico e rolagem interna. Reproduzido em 568×320: antes ultrapassava a tela; depois ficou entre y=16 e y=304, com conteúdo rolável. Também conferido em 320×568 e 390×844.
- Caixa de saída distingue erro de consulta de lista vazia, permite repetir consulta e descarta respostas ultrapassadas.
- Edição, cancelamento e reenvio têm trava síncrona, tratamento de exceção e liberação em finally. Edição mantém rascunho em erro; cancelamento exige resultado válido e mantém confirmação aberta se falhar.
- Histórico enviado aguarda mensagens e alunos; erro em qualquer consulta impede apresentar histórico parcial como completo.
- Campos do formulário de edição têm rótulos associados.

Conferidos em homologação: login, dashboard/menu, catálogo/formulário de modelos, lista/cadastro de alunos, caixa de saída/falhas, agenda e configurações. Não houve escrita de alunos/mensagens/avaliações nessa conferência. Conta descartável removida, contagens de baseline restauradas, aba/túnel/Vite encerrados. Não é certificação de todos os celulares ou teclados reais.

Validação local: **349 testes em 47 arquivos**, tipos estritos, ESLint com zero avisos, alcance de módulos e build aprovados. Frontend publicado em `fa56487`, [workflow 38797495844](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38797495844) aprovado. Entrada `index-WB7GnXUU.js`, CSS `index-CCB9RcUZ.css` e `CaixaDeSaida-C48Lj6Qv.js` coincidem por SHA256 com o build local; rota da caixa de saída SHA256 `6bc387c9ec66cf9accf15b20d719b065dcd92bda3ba9fc8fcb34e695a5dc5ca8`.

## Borda pública e limites

Seis rotas externas conferidas com curl/IPv4, TLS validado: Auth health/settings 200; administração 404; alunos/função diária sem autorização 401. HSTS/nosniff preservados. Uma tentativa Python teve timeout/403 e não foi contada como aprovação; curl confirmou os resultados esperados. Revisão automática bloqueou a tentativa adicional de handshake WebSocket externo; não executado neste lote. Saúde HTTP do Realtime isolado e produção foi conferida.

Não foram comprovados neste bloco: vários dias de estabilidade, disparo natural futuro do backup, recuperação em host vazio/DNS/TLS/provedor, backup externo independente ou Gemini real. Esses limites e os alertas residuais continuam registrados, sem impedir análise de layout em paralelo à manutenção.
