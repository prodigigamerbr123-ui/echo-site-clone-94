# Data real de atendimento nas avaliações

18/10/2026. Implementação local para revisão. Nenhuma alteração de produção.

## Fluxo

Ao registrar uma avaliação como realizada, a tela pede **Data real do atendimento** e mantém separado o horário marcado. Para compromisso antigo, o campo começa vazio e exige informar e conferir a data; o atalho Hoje apenas preenche o campo, sem confirmar. Para compromisso do mesmo dia, sugere o dia marcado. Alterar o dia exige nova conferência.

O histórico distingue **Agendada para**, **Atendimento em** e **Baixa registrada em**. A data real usa calendário de Brasília; o registro da baixa mantém seu timestamp. A ficha usa a data do atendimento como referência da última avaliação, preservando uma referência mais recente já existente. Não foram inseridos atendimentos fictícios nem recuperadas datas reais a partir de agendamentos antigos.

- Datas futuras, inválidas, infinitas e anteriores ao nascimento são rejeitadas no servidor; calendário e data limite também são verificados na interface.
- Mantida a regra de não fechar um compromisso de dia futuro: ajuste o agendamento antes de registrar um atendimento antecipado de outro dia. Antecipação no mesmo dia mantém confirmação explícita.
- Não é possível alterar silenciosamente a data de uma avaliação já encerrada. Repetir a mesma baixa é idempotente; repetir com outra data gera aviso. Correção posterior de resultados/data encerrados continua um fluxo separado a discutir.
- Mensagens continuam opcionais e respeitam a preferência de contato. Em compromisso antigo, começam desmarcadas. Quando solicitadas, seu prazo continua contando da baixa; não é feito envio retroativo automático.
- Realizadas no mês passa a usar a data real nos novos registros. Para registros legados sem data informada, a métrica preserva o cálculo anterior pela baixa. No histórico, esses atendimentos aparecem sem data real informada.

## Implementação

Migração aditiva `20261019000000_evaluation_performed_date.sql`: adiciona `evaluations.performed_on` anulável, sem backfill, e `complete_evaluation_on_tx`. A RPC preserva a autorização dos perfis existentes, usa a mesma ordem de locks da agenda, chama a transação já validada e mantém gravação, resumo do aluno, cancelamento de lembretes e novas mensagens atômicos. O resumo interno passa a respeitar a data real quando presente. Não há permissão REST para reescrever a nova coluna.

Clientes antigos mantêm a RPC existente; suas conclusões continuam sem data real explícita. Uma nova tentativa não preenche retroativamente dados de um registro legado já fechado. A data inicial informada no cadastro permanece separada da agenda.

## Verificação

Node 22.23.3: **453 testes em 65 arquivos**, lint, tipos, build e alcance aprovados. Novos testes PGlite aplicam as migrações e cobrem autorização, datas, resumo mais recente, idempotência, rollback de falha, recusa de mensagens, compatibilidade legada e mês do atendimento. Interface cobre data explícita, conferência, transmissão à RPC, retorno à ficha/agendamento e as três datas no histórico.

Prévia HTTP 200 e simulação em memória aprovadas: conclusão preserva o horário marcado, guarda a data real, atualiza a referência e não duplica no replay. Não substitui conferência visual completa ou homologação remota. Nenhuma mensagem real ou IA paga foi usada.

## Demonstração e próximos passos

Em `http://127.0.0.1:18091/.workout-preview.local/index.html#/agendar-avaliacao`, use o compromisso antigo de Bruno: Realizada → informe a data ou Hoje → confira → salve → Ver histórico. Os dados são fictícios, apenas em memória, e reiniciam ao recarregar.

O cliente aprovou preferência de contato. Esta etapa aguarda revisão. Antes de publicar o conjunto: backup verificado, homologação das cinco migrações locais em ordem, funções e frontend, além do retorno preparado. Em rollback, preservar coluna/datas existentes e evitar voltar a um frontend que deixe de registrar a data real. Não remover ou inferir datas dos registros já capturados.
