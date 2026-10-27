# Resultado da programação de mensagens

18/10/2026. Entrega local para revisão, sem publicação.

## Fluxo completo

Selecionar alunos → compor → conferir destinatários/programação/fila existente → confirmar → ver o resultado → acompanhar na Caixa de saída.

Uma confirmação bem-sucedida agora mostra um resumo persistente na tela, em lugar de depender somente de uma notificação passageira. O resumo mostra a quantidade registrada pelo servidor, a previsão da revisão, os alunos selecionados e o conteúdo usado. O total inclui repetições e não é apresentado como quantidade de pessoas que efetivamente receberam.

- Resultado recuperado de tentativa anterior é identificado explicitamente: não houve criação extra nessa confirmação. O total é histórico da operação, não contagem atual de pendentes.
- Quantidade zero ou diferente da previsão aparece com orientação para conferir a Caixa de saída antes de preparar outro envio. A resposta não permite atribuir quais alunos tiveram mensagens criadas; o resumo mantém a expressão alunos selecionados.
- Abrir Caixa de saída leva à aba Agendadas, com a fila geral. Não há filtro por lote nem consulta de recibo de entrega. Para um aluno, também existe atalho à ficha.
- Preparar outra mensagem abre formulário limpo, sem texto ou destinatários anteriores e com opções de repetição reiniciadas. Essa ação não cria mensagens.
- Falha mantém a revisão/rascunho, em vez de mostrar resultado como sucesso. As proteções contra cliques repetidos e repetição idempotente foram preservadas.

O resumo existe apenas na memória da tela e termina ao navegar/recarregar. O histórico durável continua no banco e na Caixa de saída. Não foi criado armazenamento local com textos ou dados de alunos.

## Verificação e demonstração

Node 22.23.3: **476 testes em 70 arquivos**, lint, tipos, build e alcance aprovados. Novos testes verificam quantidade real, zero/diferença, resposta recuperada, links e retorno explícito a um novo rascunho sem gerar outro envio. HTTP do módulo da prévia aprovado; conferência visual completa continua pendente. Nenhuma mensagem real, IA paga ou alteração na VM.

Na prévia `http://127.0.0.1:18091/.workout-preview.local/index.html#/mensagens?aluno=demo-ana`, escreva uma mensagem, confira a fila fictícia, confirme e use Abrir Caixa de saída. Tudo fica no adaptador em memória e reinicia ao recarregar.

Não há migração nem mudança de protocolo nova. O conjunto permanece local e depende das cinco migrações anteriores, homologação, backup verificado e combinação de publicação com o cliente.
