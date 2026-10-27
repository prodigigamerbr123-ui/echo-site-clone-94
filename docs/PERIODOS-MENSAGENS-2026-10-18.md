# Períodos e calendário da Caixa de saída

18/10/2026. Entrega local para revisão, sem publicação.

## Problemas corrigidos

No histórico enviado, Hoje e Este mês começavam na data local do navegador e não tinham limite superior. Isso podia incluir dias/meses seguintes. Nas programadas, o período personalizado usava limites locais; escolher apenas o primeiro dia criava um intervalo aberto, diferente do comportamento nas enviadas. A exibição do histórico também dependia do fuso do navegador.

## Comportamento atual

Uma regra compartilhada calcula o início/fim dos períodos em Brasília:

- Hoje inclui todo o dia de Brasília, até antes da meia-noite seguinte.
- Este mês inclui o mês de Brasília e exclui os meses adjacentes.
- O calendário personalizado respeita os dias escolhidos no seletor, convertidos para limites de Brasília. Um único dia selecionado filtra somente esse dia; início e fim incluem os dois dias integralmente, até os últimos milissegundos do último dia.
- Sem seleção personalizada, todos os períodos permanecem visíveis e a tela explica como escolher um dia ou intervalo. Janelas inválidas/invertidas não correspondem a registros.
- Buscas e seleção de aluno continuam combinadas com o período. Registros legados com timestamp inválido aparecem sem data disponível quando Todos os períodos estiver selecionado; ficam fora de períodos específicos.

O histórico mostra data/hora com Brasília explícito. As telas recalculam filtros dos dados carregados a cada 30 segundos e ao retornar à janela, aproveitando o relógio já usado na agenda. Isso não significa receber novos registros em tempo real. Atualizar histórico consulta novamente o servidor; Atualizar lista continua disponível nas programadas.

## Verificação

Node 22.23.3: **510 testes em 75 arquivos**, lint, tipos, build e alcance aprovados. Novos testes cobrem igualdade entre filtros de enviadas/programadas, limites de dia/mês, ano novo, ano bissexto, último milissegundo, dia único, ausência de seleção e janela inválida. Um teste de interface simula a virada da meia-noite com atualização automática de Hoje; outro confere atualização manual do histórico e contagem.

Prévia e módulos respondem HTTP 200. Conferência visual completa e validação remota permanecem pendentes. Nenhum WhatsApp real ou chamada paga foi usado. Não há migração nova; o conjunto continua dependente das cinco migrações locais anteriores e homologação/publicação combinadas com o cliente.

## Demonstração

`http://127.0.0.1:18091/.workout-preview.local/index.html#/caixa-de-saida?aba=enviadas`.

O histórico fictício contém uma mensagem de hoje e outra de ontem. Alterne Hoje, Todos os períodos e um período personalizado para comparar. Esses registros são apenas fixtures em memória; não representam envios ao WhatsApp e reiniciam ao recarregar.
