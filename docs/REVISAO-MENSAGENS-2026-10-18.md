# Revisão antes de colocar mensagens na fila

18/10/2026. Entrega local para revisão, sem publicação.

## Fluxo

O compositor passa a usar **Conferir envio** ou **Conferir agendamento**, mesmo para um único aluno. A revisão mostra destinatários, texto personalizado selecionável por aluno, número de ocorrências por aluno, total de mensagens e programação em Brasília. Voltar preserva seleção, texto e opções. Somente Confirmar e colocar na fila grava mensagens.

- Recorrências sobrepostas são contadas uma vez por data e aluno, incluindo o primeiro envio. Limites existentes do servidor são também conferidos na revisão: 500 alunos, 5000 mensagens e 20 grupos de intervalos.
- Destinatários inativos e números compartilhados exigem conferência explícita. Números são normalizados para reconhecer formatos diferentes do mesmo WhatsApp. Não há deduplicação silenciosa entre pessoas: cada cadastro selecionado continua gerando suas mensagens.
- Recusa de contato e telefone inválido impedem revisar o envio. Mensagens personalizadas acima do limite também são rejeitadas.
- A revisão guarda cópia do conteúdo, destinatários e programação. Mudanças nos dados carregados de um destinatário exigem voltar e revisar. O parâmetro aluno da URL deixa de reaplicar a seleção a cada atualização da consulta.
- Programação vencida é conferida antes da primeira confirmação. Uma repetição após falha ambígua pode consultar novamente o servidor com o mesmo payload/identificador, mesmo quando a data original já passou; isso permite recuperar o resultado de uma transação que já tenha sido gravada.
- Erro mantém revisão e rascunho disponíveis, libera nova tentativa e orienta conferir a Caixa de saída antes de criar um envio diferente. Uma confirmação em andamento bloqueia voltar e cliques repetidos.
- Resultado usa a quantidade confirmada pelo servidor, podendo ser menor se algum contato foi desativado. Fila não é apresentada como entrega. A distribuição do envio imediato é uma estimativa, sem promessa de evitar bloqueios do WhatsApp.

A personalização do nome também foi corrigida para tratar caracteres de substituição do JavaScript, como `$&`, literalmente, alinhando a prévia ao texto do nome.

## Limites

A revisão não congela os dados no banco: o servidor continua usando o cadastro atual, validando preferências, datas e autorização na transação. Mudanças feitas por outro dispositivo podem ocorrer após a leitura local. Não foi acrescentado bloqueio global entre telas ou uma fila de campanhas. A etapa seguinte adicionou consulta dos envios existentes para os selecionados: ver `FILA-NA-REVISAO-2026-10-18.md`. Horários de silêncio e frequência entre automações continuam evoluções separadas.

## Verificação e demonstração

Node 22.23.3: **464 testes em 67 arquivos**, lint, tipos, build e alcance aprovados. Novos testes cobrem contagem e sobreposição, snapshot, telefone compartilhado/inativo, prévia personalizada, limites, mudanças de contato, voltar/rascunho, falha/repetição, trava de confirmação e data vencida antes/depois de falha ambígua. Nenhum WhatsApp real ou IA paga.

Prévia: `http://127.0.0.1:18091/.workout-preview.local/index.html#/mensagens`. Selecione um aluno, escreva usando `{nome}` e use Conferir envio. O adaptador em memória usa o planejador real para demonstrar horários/recorrências sem chamar o provedor. Registros reiniciam ao recarregar. HTTP e transformação dos módulos conferidos; inspeção visual completa continua pendente.

Esta etapa não acrescenta migração nem altera o protocolo de enfileiramento. O conjunto ainda depende das cinco migrações locais anteriores e da homologação já documentada. Publicação continua aguardando combinação com o cliente, backup verificado e retorno preparado.


Evolução posterior: o resultado após confirmar ganhou resumo com atalhos à Caixa de saída/ficha e novo rascunho limpo. Ver `RESULTADO-MENSAGENS-2026-10-18.md`.
