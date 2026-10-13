# Contratos e lint — 13/10/2026

Estado: lote local validado; produção permanece em c62f87c.

Lint: zero erros e 15 avisos de react-refresh/only-export-components.
As regras não foram desativadas. Avisos de dependências de hooks nas
notificações, configurações e telas de modelos/histórico foram corrigidos.
Os avisos restantes tratam de exportar componentes e funções no mesmo
arquivo, não demonstram falhas de segurança.

## Mudanças com efeito funcional

AIContracts valida argumentos do modelo e da confirmação persistida:
IDs UUID, valores obrigatórios, datas de calendário, resultado de avaliação,
limites de consulta e períodos coerentes. Proposta de mensagens aceita
entre 1 e 200 alunos, rejeita duplicatas, limita conteúdo a 1.000 caracteres
e somente permite tipo manual. Campos extras são descartados.
Agendamento da mensagem deve continuar futuro quando confirmado.
Histórico enviado pelo cliente aceita apenas user/assistant e limites de
40 mensagens / 12.000 caracteres por mensagem; campos tool_calls do
cliente não são aproveitados.

JSON de argumentos inválido não produz mais proposta vazia. Respostas
malformadas do provedor são recusadas. Erros internos arbitrários não são
expostos no catch geral. Logs das ferramentas não copiam os argumentos
com dados de alunos.

Helpers de avaliação passaram a usar tipos do banco, propagam erros de
configurações/conflitos e validam a resposta de mutate_evaluation_tx.
O frontend usa a mesma validação de resposta. Quando o resultado é
incompleto, orienta conferir a agenda antes de repetir a operação.
Tipos do schema incluem a tabela e RPCs de confirmações já existentes;
nenhuma migração nova foi criada.

Evolution trata resposta sem flags booleanas reconhecidas como unknown.
Um ID que seja objeto, número, booleano ou vazio não confirma envio;
continua como entrega incerta. Não há reenvio automático novo.

## Evidências

- 12 suítes / 104 testes aprovados; testes novos incluem propostas
  inválidas, injeção de system no histórico, repetições de destinatário,
  resposta incompleta da agenda e resposta malformada da Evolution.
- TypeScript e build aprovados.
- Deno check aprovado para ai-assistant, ai-database-actions,
  daily-briefing, daily-automation, whatsapp-status e worker da fila.
- verify-stage-contracts.py executado na stack isolada: 17 verificações
  funcionais e 11 hashes de arquivos. Sem credenciais de provedores e
  em rede interna. Auth/RLS preservados.
- Histórico forjado e confirmação inválida recusados. Confirmação
  persistida com argumentos inválidos marcada failed sem gravar aluno/fila.
- Proposta válida criou uma avaliação e a quantidade de lembretes
  informada; repetir a confirmação retornou alreadyProcessed e
  preservou a quantidade. Histórico de envios permaneceu vazio.
- Fixtures e conta temporária removidas; quantidade inicial de alunos
  e fila restaurada. Arquivos de função anteriores do staging restaurados.

Resultado restrito: /opt/workout-stage-security-20261012/contracts-validation.json.
Nenhuma chamada à Evolution/Gemini foi feita nesta rodada, nem alteração
em produção. O teste de proposta válida dispensou resumo pago porque o
staging não tem chave de IA.

## Limites e próximo passo

Lote pronto para preparação da publicação coordenada. Não representa
eliminação de toda dívida de arquitetura: consultas antigas do dashboard
e briefing ainda merecem revisão de paginação/erros, e o cache de modelos
do backend mantém o desenho anterior. Gemini real e interação visual das
telas com os novos contratos não foram exercitados nesta rodada.
Primeira execução natural do histórico implantado em produção continua
pendente de conferência após o cron.
