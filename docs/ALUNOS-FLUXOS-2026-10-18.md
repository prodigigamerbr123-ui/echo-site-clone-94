# Alunos: ficha, edição e vencimentos

Data: 18/10/2026. Estado: implementação local, sem publicação neste bloco.

## Problemas corrigidos

1. O switch inativava imediatamente. Agora existe confirmação com consequências explícitas; cancelar não grava nem agenda mensagem. A edição pede a mesma confirmação ao mudar de ativo para inativo.
2. As operações permitiam cliques simultâneos. Travas em memória e estados de carregamento impedem nova submissão; campos, cancelamento e ações da ficha ficam indisponíveis durante a gravação.
3. Uma edição antiga podia desfazer uma renovação. A atualização exige que os campos editáveis ainda correspondam ao registro aberto, tratando campos nulos com `IS NULL`. Zero linhas alteradas resulta em aviso e atualização do cache, sem mensagem de sucesso. A mudança rápida de status compara apenas o status original porque altera somente esse campo.
4. O agendamento de reengajamento capturava falhas sem informar o usuário. O helper retorna `queued`, `disabled` ou `failed`; a ficha/edição reconhece o aluno salvo e avisa sobre a falha de programação. Consulta de configurações, texto e fila continuam separadas da gravação do aluno.
5. A lista exibia “Em dia” apenas porque havia vencimento futuro. Agora apresenta a situação do prazo cadastrado, incluindo “Vence hoje”. Filtros e contadores comparam chaves estáveis em vez de textos traduzidos. A chave persistida da coluna permanece compatível.
6. A ficha exigia rolagem para agir e não permitia editar diretamente. Agora as ações aparecem no início, com retorno à mesma ficha após editar ou renovar, inclusive quando ela é aberta após cadastro. A ficha consulta o registro atualizado e bloqueia alterações quando não consegue confirmá-lo; o controle de concorrência da gravação continua vigente.
7. A consulta da ficha ignorava avaliações passadas com status agendado. Agora mostra o compromisso em aberto mais antigo, com “aguardando baixa” quando o horário já passou e acesso à agenda. Não conclui, cancela ou registra falta automaticamente. Compromisso existente ou consulta com erro oferece “Abrir agenda”, sem sugerir que não há agendamento. Datas de compromisso usam explicitamente o fuso de São Paulo.

## Alterações anteriores preservadas

Cadastro com revisão, duplicidades e telefone compartilhado; início da matrícula; benefício; avaliação anterior informada sem atendimento fictício; renovação com tratamento de fim de mês e controle de concorrência; regras de convite que consideram início informado; cancelamento de lembretes de vencimento desatualizados. São mudanças locais recebidas do bloco anterior, sem nova afirmação de publicação.

## Verificação

- Suíte completa após ampliação da ficha: 385 testes em 53 arquivos. A rodada anterior tinha 378 testes em 52 arquivos.
- Suíte, lint, tipos, build e alcance conferidos com Node 22.23.3, sem substituir o Node instalado globalmente. A primeira passagem local com Node 24 também passou.
- ESLint, TypeScript estrito, build Vite e alcance de módulos aprovados.
- `npm run audit:security`: zero vulnerabilidades retornadas na consulta anterior deste lote; dependências preservadas na ampliação da ficha.
- Testes isolados de interface e banco; nenhum envio real de WhatsApp ou chamada paga de IA.
- Finais de linha CRLF preservados nos três arquivos que já tinham CRLF no índice. A inspeção de whitespace considera `cr-at-eol` para não confundir esse terminador com espaço final.

Essas verificações não substituem a revisão visual com o cliente nem a homologação do backend. Não houve validação visual no navegador, alteração de produção, migração remota, commit ou push neste bloco.

Prévia local: `http://127.0.0.1:18091/.workout-preview.local/index.html#/alunos`. Os componentes reais utilizam um adaptador temporário em memória, com conexão externa bloqueada por CSP. Ana demonstra compromisso futuro; Bruno, avaliação aguardando baixa e prazo vencido; Carla permite conferir edição e renovação. O adaptador não reproduz garantias transacionais do PostgreSQL e não substitui homologação. Os arquivos estão ignorados pelo Git e não entram no build de produção.

## Pendências do próximo lote

- Mostrar os fluxos locais ao cliente e registrar ajustes aprovados.
- Validar em homologação a combinação das duas migrações locais, função diária e frontend antes de publicação; exigir backup verificado e procedimento de retorno.
- Alinhar fallback de reengajamento: helper usa 20 dias; catálogo mostra 30 na ausência de configuração persistida. Os parâmetros persistidos continuam prevalecendo.
- Preferência de contato e motivo/data de inativação continuam propostas, sem implementação neste bloco.
- Cadastro/inativação e programação de mensagem ainda não formam transação única. Uma interrupção do navegador entre as operações pode deixar a automação sem programação.
- Recuperação após resposta de gravação perdida e histórico de alterações do aluno exigem trabalho próprio.
- Prosseguir com o ciclo de avaliações e revisar suas datas de realização/baixa antes de mudanças visuais amplas.

Os riscos residuais de infraestrutura e operação permanecem em `handoff.md`; esta entrega não encerra toda a auditoria.


## Continuação: busca consistente na rotina

18/10/2026. A busca da lista de alunos já normalizava acentos e máscaras. Esse comportamento passou a ser compartilhado com seleção de destinatários, seleção de aluno na agenda, histórico de avaliações, mensagens programadas e mensagens enviadas. O texto das mensagens também passa a aceitar diferenças de acento, caixa e espaços internos.

Telefone completo é encontrado com ou sem DDI +55; o DDD 55 continua sendo tratado como DDD quando tem comprimento nacional. CPF permanece pesquisável na lista que já carrega esse campo; não foram acrescentadas consultas de CPF ao compositor ou à agenda. Buscas com letras e números não são convertidas indiscriminadamente em busca numérica. Relação de aluno indisponível não derruba a busca do texto de uma mensagem.

A seleção existente é preservada ao filtrar destinatários. Filtros de data, aluno, situação e demais regras continuam combinados com a busca, sem ampliar permissões ou consultar dados adicionais. Não há busca aproximada ou correção automática de nomes.

Verificação ampliada: **501 testes em 73 arquivos**, lint, tipos, build e alcance aprovados com Node 22.23.3. Testes incluem nome acentuado, espaços internos, máscara de telefone/CPF, DDI versus DDD 55, relação ausente, seleção oculta por filtro e busca em mensagens com filtros combinados.

Na prévia de mensagens, experimente `(43) 99999-0000` no campo Buscar para encontrar Ana pelo telefone formatado. Nenhuma mensagem real, IA paga, migração ou publicação. HTTP da prévia e transformação dos módulos conferidos; conferência visual completa permanece pendente.
