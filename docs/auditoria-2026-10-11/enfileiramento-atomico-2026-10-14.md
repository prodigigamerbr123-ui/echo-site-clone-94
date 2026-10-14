# Enfileiramento transacional — 14/10/2026

## Alterações

- enqueue_messages_tx recebe somente a intenção de agendamento, IDs de alunos, texto e uma chave UUID da solicitação. O servidor resolve nomes cadastrados, valida datas e tipos, materializa recorrências e grava o lote inteiro em uma transação.
- Modos: envio gradual imediato; presets de hoje/7/21/45 dias; calendário de Brasília com recorrência; horário absoluto com fuso explícito para integrações. Limites: 500 alunos, 5000 mensagens por lote, 1000 caracteres após personalização, 20 intervalos e 104 repetições distintas por aluno.
- A quota de envio é aplicada dentro da transação, inclusive para chamadas diretas à RPC. Repetições confirmadas retornam o resultado armazenado sem consumir nova quota. Chave reutilizada para outro conteúdo é recusada.
- O registro privado message_enqueue_requests serializa chamadas concorrentes e vincula chave, usuário autenticado, intenção e resultado. Não há acesso de leitura ou escrita direta para usuários da aplicação.
- O cliente conserva a mesma chave em falhas de rede e após recarregar a aba. sessionStorage recebe somente um hash do conteúdo e o UUID, sem texto da mensagem, nomes ou tokens. Se o armazenamento do navegador estiver indisponível, a recuperação persiste somente na memória daquela página.
- Os dois compositores, boas-vindas, reativação, IA e endpoint de compatibilidade usam a RPC. Foi removido o utilitário legado scheduleMessages.ts, sem consumidores, que ainda fazia INSERT direto.
- Boas-vindas/reativação também têm proteção contra dois eventos simultâneos enquanto existir envio pendente ou em processamento.
- O INSERT direto de usuários autenticados foi removido depois da publicação confirmada do frontend. Avaliações continuam usando suas transações autorizadas; workers usam service_role. Um trigger de INSERT rejeita mensagens só com espaços, tabulações ou quebras de linha, preservando atualizações de registros antigos.

## Contrato de integração

RPC: enqueue_messages_tx(_request_id uuid, _student_ids uuid[], _content text, _schedule jsonb).
Resposta: request_id, queued, replayed. A identidade é a conta autenticada, nunca um parâmetro fornecido pelo cliente.

send-whatsapp e operações legadas de agendamento exigem request_id. O chamador deve guardar e reutilizar esse UUID na repetição da mesma operação; não gerar outro UUID a cada tentativa. A confirmação persistida da IA fornece a chave da sua ação.

A proteção impede duplicação do enfileiramento da mesma solicitação. Ela não garante entrega única pelo provedor externo quando há confirmação de entrega incerta; esse caso continua sendo tratado pelo worker e pelo histórico de envio. Um novo UUID com a mesma mensagem é uma nova solicitação intencional.

## Validação

- Suíte completa: 246 testes em 29 arquivos; a suíte específica da nova operação passou com 30 testes.
- Sete testes do cliente cobrem resposta perdida, recarga, edição da intenção, UUIDs de campos de apresentação, recibo inválido e novo envio deliberado após sucesso.
- Deno check dos três handlers alterados e suíte HTTP com dois testes principais/14 passos aprovados. Lint, tipos da aplicação e build foram executados; uma tipagem do fixture de teste foi corrigida após a primeira checagem.
- Na VM isolada, com Auth/PostgREST/Edge reais e sem credenciais dos provedores: 20 chamadas simultâneas produziram uma execução, 19 replays, cinco mensagens e uma quota consumida. Conferidos conflito de payload, lote parcialmente inválido, conteúdo em branco, bloqueio do INSERT direto, anonimato, quotas e caminhos legados.
- Conta/aluno temporários, mensagens, tabelas/funções candidatas e permissões da homologação foram removidos/restaurados ao final. Não houve envio real nem requisição paga de IA.

## Publicação em duas etapas

Backup verificado: 20261014T131526Z, com quatro arquivos e cópia local conferida por SHA256. Release: /opt/workout-releases/20261014-message-enqueue.

A migração 20261014020000 cria a operação e o registro privado, preservando temporariamente a permissão antiga. O runtime foi publicado, cinco handlers responderam 401 sem credenciais e os dois jobs foram retomados nos estados anteriores.

Após o workflow de frontend concluir com sucesso para o commit exato, a fase restrict de ops/supabase-self-hosted/release-message-enqueue.py aplica 20261014030000. Ela verifica o resultado diretamente na API do GitHub antes de retirar o INSERT.

Rollback: a fase rollback restaura runtime, gateway e flags originais dos jobs. Caso a restrição já tenha sido aplicada, restaura a permissão/política anteriores e remove o guard de conteúdo. A operação e seu registro privado permanecem para preservar recibos de solicitações; o retorno do frontend deve acompanhar o servidor. O diário da release registra a compensação das permissões. Não apagar recibos como rotina de limpeza, pois isso permite reenfileirar uma chave antiga.

## Limitações e próximos pontos

Abas carregadas antes da publicação precisam ser recarregadas para usar o novo contrato; após a retirada da permissão antiga elas recebem erro em tentativas antigas, sem criar registros pela rota antiga. Recuperação automática de chunks antigos permanece na etapa de resiliência.

Edição e repetição deliberada de mensagens já existentes continuam sob as permissões e guardas anteriores. Este bloco centraliza criação de lotes e não encerra toda a auditoria nem toda a revisão da agenda de avaliações.

## Resultado final da publicação

Código publicado: 91ffc22fbfbd2db008592a39eb0bacbf972ac8fb. [Workflow 38570773213](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38570773213) concluído com success.

A fase restrict conferiu esse commit na API do GitHub e aplicou a segunda migração. A verificação final confirmou: INSERT direto revogado, trigger de conteúdo ativo, duas migrações registradas, registro de idempotência com RLS e jobs nos estados originais. Também foram conferidos os 25 hashes de runtime, corpo SQL da operação, propriedade postgres, SECURITY DEFINER, search_path vazio, TimeZone UTC, execução autenticada e ausência de execução anônima.

Na aba autenticada, após recarregar a versão publicada, o compositor carregou alunos e campos de agendamento personalizado. Não foram selecionados alunos nem submetidos envios. A aba voltou ao Dashboard. O comportamento de gravação e repetição foi exercitado somente nos fixtures locais e na homologação isolada.

A suíte final teve 246 testes aprovados em 29 arquivos. Scanner final antes do commit: 357 arquivos sem padrões de credenciais detectados. Este último registro altera apenas documentação.
