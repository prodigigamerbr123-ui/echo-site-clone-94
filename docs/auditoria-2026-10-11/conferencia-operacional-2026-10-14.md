# Conferência operacional — 14/10/2026

Consulta somente de leitura na VM após o backup `20261014T175538Z`, durante a publicação do frontend. Nenhum job foi acionado, pausado ou alterado.

## Automação diária observada

O registro natural de 14/10 começou às `2026-10-14T11:00:00.09805Z` e terminou às `11:00:00.157Z`: **08:00 de Brasília**, status `success`, sem mensagem de erro.

Resumo registrado: dois alunos ativos, zero candidatos considerados, zero mensagens inseridas; limite diário 60 e prazo de avaliação 90 dias. Contadores de aniversários, lembretes e cobranças ficaram em zero. Isso comprova uma execução natural registrada sem falha; não comprova entrega de mensagens, pois não houve candidatos/envios nesse ciclo.

Os dois jobs estão ativos: `process-scheduled-messages-every-minute` com `* * * * *`, e `daily-automation` com `0 11 * * *`.

O item 35 do handoff deixa de estar sem evidência da primeira execução natural. Observação prolongada e cenários com candidatos reais continuam abertos.

## Fila e saúde

Fila no instante da leitura: 19 registros enviados, 35 falhos e quatro cancelados; nenhum pendente ou processando. As contagens coincidem com a fotografia anterior, mas este lote não investigou individualmente cada falha nem repetiu qualquer envio. Aceitação pelo provedor não equivale a entrega/leitura.

Na inspeção inicial, os containers principais listados pelo Docker estavam em execução; os que publicam healthcheck apareciam saudáveis. Isso não substitui monitoramento contínuo, teste de carga, varredura de vulnerabilidades ou teste completo da borda externa.

## Backup e homologação

Backup novo `20261014T175538Z`: quatro arquivos e marcador de conclusão verificados, cópia privada local com SHA256 independente conferido. Não é evidência de restauração integral.

A homologação preexistente estava disponível. A fixture desta rodada foi removida, a função temporária retirada e as contagens anteriores de alunos, avaliações, fila e usuários restauradas. Conta de teste desconectada e frontend/túnel temporários encerrados. Isso corrige a suposição anterior de ausência de ambiente ou artefatos baseada apenas no conteúdo do Git.
