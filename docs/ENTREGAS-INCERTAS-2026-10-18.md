# Conferência de entregas incertas

18/10/2026. Entrega local para revisão, sem alterações em produção.

## Problema encontrado

O worker grava ambiguidades como `status=failed` mantendo `dispatch_started_at`; interrupções em processamento seguem o mesmo modelo após a recuperação de itens presos. O aviso do compositor consultava o estado literal `uncertain`, além de pendentes/processando, e deixava de incluir esses registros efetivamente produzidos pelo worker. A aba Falhas já os mostrava, mas a distinção visual e as ações ainda eram confusas.

## Alterações

- Regra compartilhada considera incerta uma mensagem com estado literal uncertain ou failed com marcador de despacho. Processamento não é automaticamente tratado como resultado incerto.
- A revisão do compositor inclui as falhas ambíguas e pede a mesma conferência de fila existente. Falhas sem marcador de despacho continuam fora desse aviso.
- A Caixa de saída ganha **Conferir entrega**, acessível por `?aba=incertas`. A consulta inclui as duas representações. Nome, contato, texto, horário e motivo ficam disponíveis para conferência no WhatsApp.
- Essa aba é somente consulta: não seleciona, edita, cancela nem reenfileira registros. A aba Falhas continua mostrando todos os failed por compatibilidade; nas linhas ambíguas, a situação aparece como Entrega a conferir, com controles de alteração removidos.
- Seleção em lote exclui itens com despacho iniciado e resultados incertos. Rejeições definitivas sem despacho mantêm o fluxo de nova tentativa já existente.
- Datas e horários da lista de mensagens programadas usam Brasília explicitamente e preservam ano completo. Datas inválidas legadas recebem indicação de indisponibilidade.

Nenhuma mensagem foi marcada manualmente como enviada, entregue, lida ou resolvida. Conferir a tela não encerra automaticamente a pendência; uma reconciliação persistente com evidência do provedor continua um fluxo separado. O banco e o worker mantêm suas regras existentes contra reenvio de despacho iniciado. Não há migração nova.

## Verificação

Node 22.23.3: **483 testes em 71 arquivos**, lint, tipos, build e alcance aprovados. Novos testes cobrem classificação das duas representações, aviso do compositor para falha ambígua, filtragem de falha definitiva, navegação direta, ausência de controles de alteração e fronteira de data/fuso de Brasília. HTTP da prévia e módulos conferido. Os filtros REST foram verificados no código e fixtures; aplicação remota/homologação permanece pendente. Conferência visual completa também permanece pendente.

Nenhuma mensagem real, chamada paga, publicação ou operação na VM.

## Demonstração

`http://127.0.0.1:18091/.workout-preview.local/index.html#/caixa-de-saida?aba=incertas`.

Carla tem um registro fictício failed com despacho iniciado. Ele aparece na aba de conferência, sem reenvio/edição, e também no aviso ao preparar nova mensagem para Carla. O adaptador é apenas em memória, sem provedor real; dados reiniciam ao recarregar.

O conjunto continua dependendo das cinco migrações locais anteriores, homologação, backup verificado e combinação de publicação com o cliente.


## Continuação: acesso à conversa e atualização da lista

A conferência ganhou **Abrir conversa no WhatsApp** em registros incertos com telefone brasileiro válido. O link normaliza o número, abre outra aba e não contém texto pré-preenchido nem executa envio. Não é uma consulta à API do provedor e não confirma entrega. Número ausente/inválido recebe orientação para conferir o cadastro, sem gerar URL inválida. A aba externa pode exigir login no WhatsApp.

A Caixa de saída também permite **Atualizar lista** sem reenfileirar ou modificar dados; filtros permanecem disponíveis. O painel diário tem atalho direto para Conferir entregas incertas. Conferir uma conversa não altera automaticamente o registro e não resolve a pendência sem evidência.

Verificação ampliada: **492 testes em 72 arquivos**, lint, tipos, build e alcance aprovados com Node 22.23.3. Testes conferem normalização, URL sem texto de envio, atributos da nova aba, telefone inválido, acesso pelo registro e atualização sem mutação/RPC. Nenhum link real do WhatsApp foi aberto durante os testes; testes usam DOM e fixtures locais. O funcionamento de uma sessão externa do WhatsApp não foi verificado.

A prévia permanece na mesma rota de conferência. Sem nova migração ou publicação.
