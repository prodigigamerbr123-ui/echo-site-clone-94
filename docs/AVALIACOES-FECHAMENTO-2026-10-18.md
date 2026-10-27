# Avaliações: revisão do resultado e próximo atendimento

**Evolução posterior:** o fechamento foi aprovado e passou a pedir a data real de atendimento. Consulte `DATA-REAL-AVALIACAO-2026-10-18.md` para o comportamento atual; o texto abaixo registra a primeira entrega local.

18/10/2026. Implementação local para aprovação, sem publicação.

## Fluxo implementado

- Realizada, falta e cancelamento abrem um diálogo com aluno, compromisso, observações e consequências. O primeiro clique não grava o resultado.
- Realizada informa que a data considerada para o atendimento continua sendo a do compromisso; a baixa é registrada agora. Compromisso de dia anterior exige confirmação adicional de que a data foi conferida.
- A mensagem de acompanhamento ou convite de retorno pode ser desmarcada. Para compromissos antigos, começa desmarcada. A configuração atual é conferida novamente quando o usuário pede a mensagem; salvar sem mensagem dispensa essa consulta.
- Configuração indisponível não bloqueia o registro sem mensagem. Automação desligada é descrita como desligada, sem prometer convite para amanhã.
- Falta antes do horário do compromisso é impedida pelo diálogo. Atendimento antecipado no mesmo dia exige confirmação explícita de que já aconteceu. Dia futuro continua bloqueado para realizada/falta. Essas verificações de interface não alteram as regras de autorização ou a função SQL existente.
- Após salvar, um resumo persistente na página mostra resultado, mensagens criadas, repetição já aplicada e eventual envio iniciado. Não confunde mensagem programada com enviada ou entregue.
- O próximo horário usa o mesmo aluno com data vazia e cria outro compromisso, preservando a falta, realização ou cancelamento anteriores. A ficha do aluno pode ser aberta diretamente do resumo.
- Compromissos antigos pendentes também oferecem remarcar e cancelar. Não é necessário registrar uma falta para depois decidir que o caso era cancelamento ou remarcação.
- Caches de ficha, lista, avaliações, dashboard e mensagens pendentes são invalidados após a operação.
- Textos padrão compartilhados deixaram de presumir “ontem” ou “uma semana”, pois o prazo configurado e o momento da baixa podem ser diferentes. Modelos personalizados existentes não foram reescritos.

## Verificação

**407 testes em 57 arquivos**, ESLint, TypeScript estrito, build e alcance aprovados com Node 22.23.3. Novos testes cobrem confirmação de data antiga, mensagem opcional, automação desabilitada/indisponível, horários futuros, travas durante gravação e retorno ao formulário com o aluno correto. Os testes existentes de transação e recuperação permanecem aprovados.

HTTP 200 na página da agenda e no novo componente via servidor local. Não houve conferência visual automatizada no navegador, novo envio real de WhatsApp, chamada paga de IA, migração remota, commit ou push. A consulta npm anterior permanece como evidência do lote; dependências não mudaram.

## Prévia e limites

`http://127.0.0.1:18091/.workout-preview.local/index.html#/agendar-avaliacao`

Bruno possui um compromisso antigo fictício para testar os resultados. O adaptador temporário simula fechamento, mensagens programadas, criação e remarcação apenas em memória; recarregar reinicia os exemplos. Ele não substitui a validação transacional do PostgreSQL. Não há conexão com o backend real na demonstração.

Este lote não adiciona uma data real de realização independente de `scheduled_at`, nem motivo estruturado de cancelamento ou medidas físicas. Se o atendimento aconteceu em outra data, a interface agora expõe essa limitação; corrigir esse dado com histórico próprio exige evolução adicional do modelo. O follow-up continua contando a partir da baixa, com opção explícita de não prepará-lo.

Para publicação, considerar frontend e textos compartilhados dos handlers, além das migrações locais anteriores de alunos. Preparar homologação, backup verificado e retorno. A ficha, o painel e depois este fluxo de avaliações foram aprovados pelo cliente na conversa (“achei legal, continue”). A etapa seguinte de histórico de planos tem evidência própria.
