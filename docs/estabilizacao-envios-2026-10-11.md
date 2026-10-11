# Primeira rodada de estabilização — 11/10/2026

Implementação local. Estas mudanças precisam da publicação coordenada do banco, das Edge Functions e do frontend.

## Comportamento

- Uma mensagem inicial com quatro repetições semanais cria cinco ocorrências. O worker não cria mais ocorrências depois do envio. Intervalos sobrepostos são deduplicados.
- Toda série nova tem um identificador comum, e a caixa de saída permite cancelar suas ocorrências ainda não iniciadas. O cancelamento preserva as linhas e o histórico.
- Há um único worker ativo por lease da instância, com lote de três envios, limite de tempo e timeout no provedor. WhatsApp indisponível pausa a fila.
- Depois das pausas entre envios, o banco verifica novamente estado do aluno, automação, expiração, avaliação e vencimento. Uma mensagem não elegível fica cancelada com motivo.
- Lembretes automáticos vencem ao final do dia de envio em São Paulo. Avisos de avaliação também conferem o compromisso e seu horário. Mensagens manuais/recorrentes não ganham expiração automática.
- Ao começar o despacho, a fila registra `dispatch_started_at`. Cancelar antes desse ponto impede o despacho. Depois desse ponto, a interface informa que a mensagem pode chegar ao aluno: não há mecanismo para desfazer uma mensagem já enviada ao provedor.
- HTTP de sucesso sem ID, erros de servidor após despacho e exceções de rede ficam como entrega incerta. Esses itens não são reenviados automaticamente. A interface orienta conferir no WhatsApp e, se necessário, compor um novo envio manual.
- Fila enviada e histórico são gravados numa transação. Se o registro falhar após aceitação do provedor, o envio permanece incerto e não é duplicado automaticamente.
- Agendar, remarcar, cancelar, concluir e registrar falta usam `mutate_evaluation_tx`. Avaliação e mensagens mudam na mesma transação; uma mensagem inválida desfaz a operação. Repetir uma conclusão/remarcação já aplicada não cria outro follow-up/lembrete.
- Concluir uma avaliação antiga não retrocede a última avaliação do aluno. Follow-up parte do momento da conclusão, evitando criar uma mensagem já vencida.
- O endpoint legado `send-whatsapp` passa pela fila e resolve destinatários cadastrados com o token do usuário. Nomes/telefones recebidos do navegador são ignorados.
- A caixa de saída mostra também itens em envio e cancelados. Edições e retries verificam estado atual no banco; lembretes vinculados são alterados pela agenda.

## Publicação

1. Preparar backup e verificar a fila/execuções em produção. Pausar temporariamente o cron do worker e a criação de novos agendamentos durante a troca. Aguardar ou reconciliar envios em processamento.
2. Aplicar, nesta ordem, `20261011010000_stabilize_message_queue.sql` e `20261011020000_atomic_evaluation_actions.sql`. Executar com o mecanismo normal de migrations do projeto. As migrations contêm transações.
3. Publicar as Edge Functions `process-scheduled-messages`, `send-whatsapp`, `ai-assistant` e `ai-database-actions`, incluindo os helpers compartilhados atualizados.
4. Publicar o frontend e atualizar as sessões que estavam abertas na versão anterior. A aplicação nova requer as novas RPCs; se faltar migration, informa erro em vez de simular sucesso.
5. Revisar os agendamentos anteriores à correção, especialmente séries antigas com ocorrências duplicadas e textos/vencimentos que já tenham sido alterados. A migration interrompe a expansão legada, mas não apaga nem tenta adivinhar quais ocorrências antigas eram desejadas. Séries antigas podem não ter um identificador comum.
6. Conferir os jobs do cron e reativar o worker depois da revisão. Para validar uma entrega real, usar somente um destinatário de teste explicitamente escolhido pelo administrador.

Os testes foram feitos com dados fictícios, banco em memória e provedor simulado. Nenhuma entrega real foi usada para validar a implementação.

O lease mantém espaçamento entre execuções da fila. Um endpoint interno de manutenção como `send-oneshot`, protegido por segredo do cron, deve ser usado somente em operações controladas: ele não participa desse lease.

## Testes

`npm run test` usa configuração fictícia no setup e não precisa de credenciais de produção. Os testes de banco executam o SQL das migrations com PGlite/PostgreSQL, incluindo rollback, proteção de despacho, permissões de RPC, lease e cancelamento de série. Eles não simulam a infraestrutura distribuída do Supabase, pg_cron ou a Evolution real.

Verificações da rodada: 42 testes Vitest passaram (19 de banco), build e tipos do frontend passaram, Deno check das cinco funções/helpers verificados passou e ESLint dos novos módulos centrais passou. Os avisos anteriores de bundle grande e Browserslist continuam existentes. Os alertas de dependências e o desenho completo de papéis/RLS permanecem nos próximos itens do plano de melhoria.

## Revisão posterior

Não remover as novas colunas ou desativar os triggers como forma de rollback. Em caso de problema de publicação, pausar a fila, inspecionar as transações e restaurar uma versão compatível com as migrations. Uma versão antiga do worker pode retomar os caminhos de envio que esta rodada protege.
