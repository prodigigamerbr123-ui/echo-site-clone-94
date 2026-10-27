# Fila existente na revisão de mensagens

18/10/2026. Entrega local para revisão. Sem publicação ou operações na VM.

## Comportamento

Ao abrir Conferir envio/agendamento, a tela consulta mensagens pendentes, em processamento ou com resultado incerto dos alunos selecionados. Mostra o total, nome, situação, horário de Brasília e texto. A lista começa com dez registros e permite mostrar os demais. Texto exatamente igual ao da nova revisão, após personalizar o nome e remover espaços nas extremidades, recebe um destaque de possível repetição.

Se houver registros, o usuário precisa confirmar que conferiu a fila e deseja acrescentar mensagens. Os registros existentes permanecem preservados. Quando Atualizar fila ou uma atualização ao voltar à janela detecta alteração nos registros, a conferência anterior perde a validade. Carregamento ou falha bloqueiam confirmar; falha apresenta recuperação, preservando o rascunho. Uma consulta com erro não é apresentada como fila vazia.

Resultado incerto não é tratado como falha definitiva: a tela orienta conferir no WhatsApp antes de repetir. Datas legadas inválidas aparecem como indisponíveis e não derrubam a revisão.

## Consulta e limites

`fetchMessageReviewQueue` usa a sessão do frontend e as permissões existentes. Filtra explicitamente os IDs selecionados e estados pendentes/processamento/incerto, pagina com contagem exata e ordenação por horário/ID, dividindo seleções em grupos de 100 IDs para limitar URLs REST. Mensagens enviadas, canceladas e falhas sem despacho iniciado ficam fora deste aviso. Evolução posterior corrigiu a inclusão de falhas ambíguas (failed com dispatch_started_at), que são o modelo usado pelo worker; ver `ENTREGAS-INCERTAS-2026-10-18.md`.

A consulta é informativa e pode mudar depois da leitura; não representa trava transacional nem deduplicação automática. Correspondência é por cadastro selecionado. Outro cadastro com o mesmo telefone que não estiver selecionado pode ter mensagens não exibidas aqui. Não há comparação aproximada de texto, bloqueio por frequência ou cancelamento automático de lembretes.

## Demonstração e verificação

Prévia: `http://127.0.0.1:18091/.workout-preview.local/index.html#/mensagens?aluno=demo-ana`. Escreva uma mensagem e use Conferir envio. A Ana tem um envio fictício pendente para demonstrar o aviso e a conferência. Nenhuma operação da prévia acessa o provedor; dados reiniciam ao recarregar.

Node 22.23.3: **472 testes em 69 arquivos**, lint, tipos, build e alcance aprovados. Testes novos cobrem paginação de 501 registros, lotes de IDs, filtro, falha/contagem desconhecida, carregamento, texto igual, confirmação, atualização de fila, resultado incerto, mais registros e data inválida. HTTP da prévia e módulos conferido; conferência visual completa e homologação remota continuam pendentes. Nenhum WhatsApp real ou IA paga.

Não há migração nova. As cinco migrações locais anteriores e funções/frontend do conjunto continuam pendentes de homologação e publicação combinada com o cliente, com backup verificado e retorno preparado.
