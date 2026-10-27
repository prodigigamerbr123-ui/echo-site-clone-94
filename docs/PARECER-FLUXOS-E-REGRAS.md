# Parecer de produto: fluxos e regras da academia

Revisão de 15/10/2026, a partir do código local de cadastro/edição/ficha de alunos, agenda/histórico, compositor, automações e migrações. Propostas para discussão; nenhuma regra de negócio ou dado de produção foi alterado nesta revisão. Este parecer passa à frente do plano de layout visual.

## Diagnóstico

O sistema dispõe de operações técnicas protegidas, mas ainda concentra decisões importantes em campos genéricos e ações isoladas. O próximo avanço é explicitar a sequência da rotina: cadastrar a pessoa, registrar sua matrícula, acompanhar avaliações e controlar contatos. Para uma academia pequena, isso pode ser feito com poucos campos e ações claras.

## 1. Cadastro e matrícula

**Constatações:** cadastro pede nome/WhatsApp, nascimento, cidade, CPF, vencimento e plano. O plano começa em Mensal. Não há data de início da matrícula na ficha gerada. `created_at` é usado para contar os 14 dias até o convite da primeira avaliação; aluno novo no sistema pode ser aluno antigo da academia. Todo cadastro começa com `had_evaluation=false`. CPF já tem índice único nas migrações; não é uma proteção ausente.

**Proposta:** manter nome/contato como núcleo, agrupar dados opcionais e explicitar início da matrícula, plano e próximo vencimento. Permitir informar avaliação anterior com data e origem, sem inventar um agendamento passado. Alertar sobre CPF existente e possíveis duplicações de contato antes da confirmação. Telefone compartilhado deve gerar aviso e escolha consciente, sem bloquear automaticamente famílias. Exibir a opção de boas-vindas e seu resultado.

Após salvar: mostrar o aluno criado e oferecer Abrir ficha, Agendar primeira avaliação e Cadastrar outro. Não deixar o usuário procurar de novo quem acabou de cadastrar. Para alunos sem contato disponível, avaliar cadastro permitido com envios bloqueados; essa regra precisa ser escolhida pelo dono.

## 2. Planos e vencimentos

**Constatações:** a lista mistura Mensal, Anual, 12 meses, descontos e convênios. O vencimento é editado junto dos dados pessoais. Não existe uma ação de renovação nessa ficha.

**Proposta:** separar duração do plano, forma/periodicidade de pagamento e benefício/convênio. Migrar nomes antigos apenas com mapeamento revisado. Oferecer Registrar renovação com data de pagamento, período coberto e próximo vencimento confirmados, preservando histórico mínimo. Definir o tratamento dos dias 29–31 e evitar assumir que todo plano mensal dura exatamente 30 dias. Um vencimento antigo deve ser descrito como pendência de regularização; a data isolada não comprova uma dívida não paga. Não requer boleto, integração bancária ou financeiro completo.

## 3. Situação do aluno e ficha

**Constatações:** ativo/inativo é alterado por um switch ou pela edição e pode agendar reengajamento. Não há motivo/data de inativação nem preferência de contato no modelo atual. A ficha já mostra próxima avaliação e últimas mensagens, mas o trabalho continua dividido entre telas.

**Proposta:** manter ativo/inativo e acrescentar motivo/data da mudança, além de uma preferência independente de mensagens. Explicitar consequências antes de inativar: lembretes que serão impedidos, avaliação futura existente e eventual convite de retorno. O backend já impede determinados envios a inativos e cancela reengajamento de quem voltou a ficar ativo; preservar essas proteções.

Promover a ficha a ponto de trabalho: resumo da matrícula, avaliação anterior/próxima, mensagens pendentes/recentes e ações de renovar, agendar, editar e contatar. Exclusão permanente deve ficar em uma área administrativa secundária; arquivar/inativar é o caminho normal de saída, com histórico preservado. Retenção e exclusão definitiva precisam de regra própria.

## 4. Avaliações

**Constatações:** o registro atual contém compromisso, status, observações e datas. É principalmente agenda/histórico; não registra medidas estruturadas de avaliação física. O conflito usa uma janela fixa de 30 minutos, sem duração do compromisso. A primeira avaliação usa idade do cadastro e a reavaliação tem prazo global configurável. Ao fechar avaliação antiga, `completed_at` é agora, a última avaliação do aluno usa a data agendada e o follow-up parte da baixa atual.

**Proposta:** uma área Avaliações com Agenda, Pendências e Histórico. Explicitar primeira avaliação/reavaliação, duração e horário disponível; começar com um único recurso da academia, sem criar estrutura de vários funcionários. Manter a consulta e a proteção transacional de conflitos já existentes.

Ao concluir, confirmar a data em que realmente aconteceu, observações e próxima reavaliação. Separar data do atendimento da data em que a baixa foi registrada. Ao regularizar um compromisso antigo, decidir se ainda faz sentido enviar follow-up; não programar comunicação descontextualizada silenciosamente. Ao faltar, oferecer Remarcar com o mesmo aluno; ao cancelar, permitir motivo e comunicação apropriada.

Se houver necessidade real de guardar resultados, adicionar uma ficha enxuta de avaliação com campos acordados com o profissional responsável. Não escolher protocolos ou fórmulas de saúde apenas como decisão de software.

## 5. Mensagens e automações

**Constatações:** boas-vindas e reengajamento são chamados pelo navegador após salvar o aluno; os helpers capturam falhas e registram no console. Assim, salvar aluno e programar contato não têm confirmação conjunta. Há fallback de 20 dias no helper de reengajamento e 30 no catálogo da tela; parâmetros persistidos podem sobrepor os dois. Os textos misturam inatividade de matrícula e ausência de contato. O compositor carrega todos os alunos sem trazer seu status para a seleção. Confirmação adicional de envio imediato só aparece acima de 100 selecionados.

**Proposta:** disparos por evento confirmados no backend, com resultado visível: cadastro salvo e boas-vindas programadas, desativadas ou com falha recuperável. Unificar defaults. Definir reengajamento como um evento claro, por exemplo X dias após inativar com motivo elegível; não inferir ausência nos treinos a partir de mensagens.

Compositor: Destinatários → Texto → Quando → Revisão. Destacar ativos/inativos, números compartilhados, pendências existentes, prévia personalizada e quantidade total de ocorrências de repetição. A revisão deve ajudar também em grupos pequenos. Preservar a distinção atual entre fila e envio aceito pelo provedor; não chamar de entregue/lido sem evidência.

Automações: apresentar Quando dispara, Quem recebe, Quando não envia e O que já está programado. Acrescentar limites de contato entre automações e horários permitidos; preservar lembretes necessários de compromissos em vez de aplicar um bloqueio indiscriminado. Antes de ativar cobrança, exigir vencimentos atualizados. Preferência de contato precisa ser respeitada também pelos caminhos de IA e backend.

## Ordem sugerida

| Ordem | Entrega | Resultado |
| --- | --- | --- |
| 1 | Cadastro, início de matrícula e ficha | Dados coerentes e próximo passo imediato |
| 2 | Planos/vencimentos e renovação simples | Menos edição manual e lembretes desatualizados |
| 3 | Situação do aluno e preferência de mensagens | Mudanças previsíveis e contatos adequados |
| 4 | Ciclo de avaliações | Agendar, concluir, faltar e remarcar com contexto |
| 5 | Eventos de automação e revisão de envios | Confirmações claras e menos mensagens indevidas |
| 6 | Layout sobre os fluxos aprovados | Organização visual refletindo a rotina |

Antes de implementar, combinar: se haverá cadastro sem WhatsApp, o significado comercial de cada plano, como a academia registra renovação e o que autoriza mensagem de retorno. São decisões de negócio; as sugestões acima não equivalem a regras já aprovadas ou funcionalidades já entregues.
