# Painel diário para revisão do cliente

Data: 18/10/2026. Implementação local, sem commit, push, migração ou publicação.

## Organização e comportamento

- O painel inicia com agenda do dia, avaliações de dias anteriores aguardando baixa, prazos vencidos e falhas de mensagens para revisar. Atalhos permanecem abaixo; indicadores completos e ideias de comunicação ficam em seções expansíveis.
- Prazos vencidos abrem a lista com filtros de alunos ativos e vencimento passado. A data cadastrada não é tratada como comprovante de dívida.
- Falhas abrem diretamente a aba correspondente na caixa de saída. A contagem considera todos os registros `failed`, incluindo antigos; não afirma que não foram entregues nem autoriza reenvio automático.
- Agenda mostra horários de Brasília e informa quando a amostra do snapshot é menor que a contagem total. Os botões abrem a agenda geral; ainda não destacam automaticamente uma avaliação específica.
- Contatos sugeridos abrem a ficha pelo identificador do aluno. Vários motivos para a mesma pessoa continuam visíveis e são contabilizados como oportunidades, não pessoas distintas. Exibe seis itens inicialmente e permite expandir.
- O estado sem sugestões não declara que todas as pendências da academia foram resolvidas. Erro de consulta recebe aviso e recuperação; falha na contagem de mensagens não vira zero.
- Números, rotina e sugestões usam a mesma consulta compartilhada `get_workout_dashboard`; a contagem de falhas é uma consulta agregada adicional, sem conteúdo de mensagens. Avaliadores não consultam essa contagem nem recebem os atalhos de contato e vencimento do novo painel.
- O relógio de atualização passa a integrar a chave diária do snapshot, respeitando a mudança do dia em Brasília quando a tela permanece aberta ou recupera o foco.

## Navegação

- `/alunos?status=active&vencimento=overdue`: filtros de prazo e situação aplicados à lista. A limpeza manual continua possível.
- `/alunos?aluno=<id>`: abre a ficha exata uma vez; fechar a ficha não a reabre a cada atualização da lista. Cadastro não encontrado recebe aviso.
- `/caixa-de-saida?aba=falhas`: seleção da aba pela URL, com fallback para agendadas quando o valor é desconhecido; mudanças posteriores de URL também são respeitadas.

## Verificação e limites

Node 22.23.3: **397 testes em 55 arquivos**, ESLint, TypeScript estrito, build e alcance aprovados. Cobertura acrescentada para navegação, falhas parciais, amostra da agenda, limites por perfil, motivos repetidos do mesmo aluno e compartilhamento da consulta. Dependências não foram alteradas; a auditoria npm anterior do lote retornou zero vulnerabilidades.

O servidor local devolveu HTTP 200 para a página de demonstração, seu ponto de entrada e o componente do painel. Isso confirma a disponibilidade e transformação dos módulos, não uma inspeção visual automatizada no navegador. O cliente aprovou depois a proposta na conversa (“ok gostei”).

Prévia: `http://127.0.0.1:18091/.workout-preview.local/index.html#/`. Utiliza os componentes reais com adaptador temporário em memória e dados fictícios. A navegação para agenda e caixa de saída também usa suas telas reais. Operações RPC de gravação no backend estão desabilitadas nesse adaptador; ele não comprova comportamento transacional em produção.

A ficha e o painel foram aprovados pelo cliente na conversa. A etapa seguinte de avaliações possui evidência própria em `AVALIACOES-FECHAMENTO-2026-10-18.md`; nessa etapa o adaptador temporário passou a simular algumas gravações em memória. Publicação continua condicionada à preparação de homologação, backup verificado e retorno; as migrações do lote de alunos permanecem locais.
