# Preferência de contato do aluno

18/10/2026. Implementação local para revisão, sem publicação ou alterações na VM.

## Comportamento

- Cadastro e edição têm **Permitir mensagens pelo WhatsApp**, independente da situação da matrícula. Registros existentes mantêm o comportamento atual até alteração explícita; não foi inferido consentimento jurídico.
- Desativar requer confirmação na edição, preserva aluno, plano e avaliações. A ficha explica o bloqueio e desabilita preparar mensagem. No compositor, o aluno continua visível com indicação da recusa, sem poder ser selecionado nem incluído em Todos.
- Ao salvar a recusa, mensagens pendentes ou em processamento sem despacho iniciado são canceladas na mesma transação. Falhas e evidências de despacho são preservadas. Reativar não ressuscita mensagens canceladas.
- Uma mensagem com despacho já iniciado ainda pode chegar. Não há promessa de recolhimento no provedor. Uma mudança simultânea à preparação final fica sujeita a esse limite.
- Preferência global por aluno: bloqueia mensagens manuais, IA, recorrências e automações. Não há categorias de autorização por assunto nesta versão. Telefones compartilhados continuam permitidos; recusar contato em um cadastro não altera automaticamente o cadastro de outra pessoa com o mesmo número. O diagnóstico interno que aceita apenas telefone é conservador: bloqueia quando qualquer cadastro desse número tiver recusado contato.

## Proteção no servidor

Migração aditiva `20261018230000_student_message_preference.sql`:

- `students.messages_enabled boolean NOT NULL DEFAULT true`; alteração segue as permissões e RLS existentes.
- Guard na fila suprime INSERT de destinatário bloqueado, inclusive jobs e IA, sem desfazer uma avaliação ou todo um lote. Reenvio/edição que tenta colocar mensagem em pending termina cancelado enquanto houver recusa.
- `enqueue_messages_tx` e `mutate_evaluation_internal_tx` contam linhas realmente inseridas. O wrapper público autorizado de avaliações e seus privilégios são preservados.
- `prepare_scheduled_message_dispatch` confere novamente a preferência imediatamente antes de marcar o despacho. O painel omite sugestões de contato bloqueado sem retirar o aluno das estatísticas e da agenda.
- A função diária filtra destinatários permitidos e usa contagem real. O diagnóstico interno normaliza e pagina números recusados, falhando sem enviar quando a consulta de preferência falha.

## Verificação

Node 22.23.3: **437 testes em 62 arquivos**, ESLint, TypeScript estrito, build e alcance aprovados. Deno check das funções diária e diagnóstico aprovado. A suíte PGlite aplica migrações reais e verifica fila, autorização, contagem, idempotência, cancelamento, reativação, avaliação sem mensagens e recusa antes do despacho. Testes de interface cobrem cadastro, confirmação/cancelamento da preferência, seletor, fechamento e reenvio, inclusive recusa concorrente.

Prévia respondeu HTTP 200 e passou por simulação do adaptador em memória (cadastro permanece ativo, bloqueio, cancelamento e ausência de restauração). Nenhuma publicação, mensagem real ou chamada paga. Conferência visual completa e homologação do banco remoto continuam pendentes.

## Demonstração

Abra `http://127.0.0.1:18091/.workout-preview.local/index.html#/alunos?aluno=demo-carla`. Edite Carla, desmarque a permissão, salve e confira a ficha. Feche a ficha e abra `#/mensagens`: Carla permanece na lista com seleção bloqueada. Também é possível cadastrar aluno fictício sem mensagens e ver as boas-vindas desabilitadas.

A prévia usa componentes reais e adaptador em memória, sem cliente de produção ou envio ao WhatsApp. Exemplos reiniciam ao recarregar. A simulação do compositor demonstra criação em memória, sem reproduzir a distribuição completa de horários/recorrências do servidor. Não equivale a homologação remota ou conferência visual completa.

## Publicação e retorno

Aplicar, em ordem, as quatro migrações locais pendentes: cadastro, cancelamento por vencimento alterado, histórico de planos e preferência de contato. Depois atualizar funções diária/diagnóstico e frontend. Antes: backup verificado, homologação com fixtures e retorno preparado. No retorno, manter a coluna, preferências e proteção da fila: frontend antigo pode omitir o aviso, mas não deve voltar a enviar para quem recusou. Não reabrir mensagens canceladas automaticamente.

Histórico de planos foi aprovado pelo cliente. O cliente aprovou esta preferência (“achei legal, continue”). A etapa seguinte implementa data real de atendimento, para revisão em `DATA-REAL-AVALIACAO-2026-10-18.md`. As aprovações continuam locais; publicação depende de homologação e combinação com o cliente.
