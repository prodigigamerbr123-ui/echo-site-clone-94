# Agenda: recuperação de tentativas e calendário — 14/10/2026

## Estado da entrega

Implementação e validação locais, sobre o trabalho anterior não commitado de extração dos hooks de consultas/métricas/ações. Sem commit, push, deploy, migração SQL, acesso de manutenção à VM, mensagem real ou chamada paga de IA neste bloco. A referência de produção continua sendo a entrega documentada de `24056d2`, com evidência em `a92f387`.

## Recuperação

`evaluationIntent.ts` guarda somente UUID e hash SHA256 do pedido no `sessionStorage`, com namespace por usuário. Observações e aluno não aparecem em texto no recibo. Bloqueio do armazenamento mantém o UUID em memória durante a vida da página. Resposta inválida, identificador divergente ou erro de rede não removem o recibo.

A recuperação acontece antes da consulta de duplicidades: procura pelo UUID com as permissões do usuário e confere aluno, horário, notas e estado agendado. Uma avaliação já persistida é reconhecida sem nova escrita nem geração de lembretes. Isso também permite recuperar depois do horário marcado, desde que continue agendada. Uma alteração posterior impede confirmação automática e pede conferência da agenda.

O reconhecimento é uma leitura do estado confirmado naquele instante, não um novo recibo no servidor. A transação existente continua responsável por gravar avaliação e mensagens juntas. A resposta de recuperação informa zero mensagens novas; não recalcula a quantidade original nem inspeciona despachos em andamento. Nenhuma operação de cancelamento é derivada dessa resposta.

Novas criações continuam passando pela consulta e pela trava transacional existente. A resposta do salvamento é validada, incluindo o UUID, antes de limpar o recibo. Identidade é revalidada depois de confirmações e antes das operações, inclusive remarcação e encerramento.

Limites: o formulário não é salvo em texto no navegador; após reload, repetir os mesmos dados reutiliza a intenção. Fechar a aba ou bloquear armazenamento reduz essa recuperação. Não há coordenação de recibos entre dispositivos, nem garantia de entrega WhatsApp exatamente uma vez. A consulta reconhece apenas avaliações ainda agendadas; alterações, conclusão/cancelamento, exclusão e mudanças no conteúdo exigem revisão do operador. O formato experimental anterior em localStorage não é migrado; não havia publicação desse formato registrada.

## Concorrência e cache

Uma referência síncrona bloqueia uma segunda operação enquanto a primeira consulta, aguarda confirmação ou salva. `saving` reflete o período inteiro. Cancelamento e erros liberam a trava. As invalidações de agenda, histórico, resumo do aluno e dashboard foram mantidas.

Revisado o AuthProvider existente: limpa o QueryClient na mudança de identidade e papel. Essa proteção foi preservada; este bloco não afirma uma revisão completa de todos os caches da aplicação.

## Calendário e histórico

Rótulos de dia são construídos com calendário de Brasília e formatação com timezone explícito. Métricas e listas recebem um relógio renovado a cada 30 segundos e ao retornar à aba. Faltas do mês usam início inclusivo e fim exclusivo, excluindo meses adjacentes.

Na revisão do histórico, identificada consulta REST ainda sem paginação e datas no fuso local. `fetchEvaluationHistory` agora usa páginas completas, contagem exata e desempate por ID. Falha em qualquer página mostra erro com nova tentativa; não exibe lista vazia/contadores zero como sucesso. Datas de agendamento e encerramento usam Brasília. A amostra de compromissos abertos informa o limite de 20 e o total.

## Validação

- Suíte completa: 298 testes em 35 arquivos, incluindo 24 novos testes neste bloco.
- Testes específicos: perda de resposta com commit anterior, recuperação antes do preflight, reload do módulo, armazenamento bloqueado, isolamento/troca de identidade, resposta inválida/divergente, avaliação modificada, consulta indisponível, trava durante confirmação e liberação após cancelamento.
- Calendário: virada de dia/ano, mês e ano bissexto; renovação de métricas sem trocar dados da query; apresentação do histórico e fronteiras mensais.
- Os nove testes de calendário também passaram em processos com `TZ=Pacific/Kiritimati` e `TZ=America/Los_Angeles`.
- Histórico: 1.201 registros em três páginas e recusa de resultado parcial quando a segunda página falha.
- Lint, tipos da aplicação e build aprovados. Scanner do repositório sem padrões de credenciais detectados no código revisado.
- Sem validação visual em navegador autenticado nem teste remoto de homologação deste lote. Testes de recuperação simulam o cliente de banco; os contratos SQL existentes não foram alterados.

## Continuação

Antes de publicar, revisar o conjunto de arquivos locais herdados e novos, selecionar um commit coerente e validar visualmente o frontend em ambiente isolado. A extração de componentes/formulários da agenda permanece parcial. Edição de notas no histórico ainda merece revisão própria de erros de rede, concorrência e confirmação de atualização autorizada. Segurança de containers, restore, credenciais e observação dos jobs continuam pendentes conforme o handoff.

Como só o frontend mudou e não há migração nova, o retorno consiste em publicar o artefato anterior. Os novos helpers exportados no módulo compartilhado mantêm o comportamento anterior das funções já usadas no backend; este bloco não publicou esses arquivos na VM.
