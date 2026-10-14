# Agenda e histórico — homologação e publicação de 14/10/2026

## Implementação

Este lote reúne a extração local anterior dos hooks da agenda, a recuperação por intenção, calendário e histórico descritos em `agenda-recuperacao-local-2026-10-14.md`, e a revisão da edição de observações.

As observações agora são atualizadas comparando o valor aberto pelo editor. A resposta precisa conter a linha autorizada e o valor gravado; atualização de zero linhas não é sucesso presumido. Uma edição idêntica já confirmada pode ser reconhecida por leitura após perda de resposta. Alteração concorrente, registro inacessível ou resposta inválida impedem sucesso silencioso. O formulário preserva o texto, libera a trava após falha e mostra erro persistente dentro do diálogo. Erros internos do banco não são exibidos em texto bruto.

Campos e cancelamento são bloqueados durante a gravação. Rótulos de data/horário da remarcação e notas foram vinculados aos controles. A descrição do histórico passou a informar corretamente que observações podem ser editadas.

## Validação automatizada

- 306 testes em 36 arquivos, incluindo oito testes novos da edição de observações.
- Lint, tipos e build aprovados.
- Scanner: 385 arquivos sem padrões detectados no momento da conferência pré-publicação.
- `diff --check` conferido com tratamento de CRLF do checkout Windows.
- As simulações de perda de resposta e relógio continuam sendo testes automatizados; não se afirma que foram reproduzidas por interceptação de rede no navegador.

## Validação integrada isolada

Frontend local `http://127.0.0.1:18091` conectado por túnel ao gateway de homologação `127.0.0.1:18090`. Confirmados rede interna, ausência de credenciais Evolution/Gemini e ausência de jobs ativos. Quando o schema cron está ausente, não existem jobs desse schema para executar.

O script `ops/supabase-self-hosted/agenda-visual-fixture.py` criou apenas conta e aluno fictícios identificados pelo estado privado da execução. A função de consulta de conflitos foi adicionada temporariamente à base antiga de homologação; nenhuma migração de produção foi reaplicada. O proprietário da função de teste foi o bootstrap de staging, conforme as permissões dessa cópia, não uma validação nova de ownership em produção.

Pelo navegador foram verificados login, carregamento da agenda, criação de avaliação fictícia em 16/10 às 09:30, estado ocupado dos botões, contador, agrupamento por dia, remarcação para 17/10 às 09:30 e consulta no histórico. A edição normal de notas foi confirmada visualmente. Uma segunda alteração controlada no registro fictício durante a edição reproduziu conflito: o texto digitado foi preservado e a alteração mais recente não foi sobrescrita. A mensagem de conflito passou a aparecer dentro do diálogo e foi conferida no navegador.

As primeiras tentativas de preencher inputs nativos por automação alteraram o valor visível sem disparar todos os eventos do formulário; nenhuma avaliação foi criada nessas tentativas. A repetição com eventos nativos de teclado confirmou os valores e salvou somente para o aluno reservado. Não foi tratado como bug comprovado da aplicação.

A preparação inicial foi ajustada para schema cron ausente e permissões diferentes da cópia. As tentativas foram limpas antes de preparar novamente. Ao terminar, conta, aluno, avaliações e mensagens da fixture foram removidos e a função temporária foi retirada. Contagens de alunos, avaliações, fila e usuários coincidiram com a base anterior. A homologação preexistente não foi desligada.

Evidência visual guardada fora do Git: `C:/Users/pejon/.codex/ssh-workout04/agenda-conflict-visual-20261014.png`. Ela retrata a fixture de homologação, posteriormente removida.

## Backup e retorno

Backup de produção `20261014T175538Z`, gerado com o procedimento existente. Catálogo do dump validado no servidor. Quatro arquivos copiados para `C:/Users/pejon/.codex/ssh-workout04/backups/20261014T175538Z`, total de 662.075 bytes, com SHA256 independente comparado ao servidor e marcador de conclusão confirmado. Artefatos e hashes completos permanecem privados.

Este lote muda o frontend; não exige nova migração de produção ou troca das funções em execução. O backend já publicado contém a consulta de conflitos. O retorno do frontend usa a revisão anterior `a92f387` pelo workflow de Pages; não restaurar banco automaticamente para desfazer alterações de interface.

## Publicação

Código publicado: `892bb88b5456e3ae92b26743b5fce1dfb8c2a49b`. [Workflow 38611036898](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38611036898) concluído com sucesso para esse SHA.

O site público serviu `assets/index-7i7UasPL.js` e os módulos atuais de agenda/histórico. Conferidos por HTTP: agenda SHA256 `1b033c28caf99e5e15eaa2af8210ee8b5e7132c1d526f22654ee28ab8ebc8fad`, histórico `9692e945f12992a4c9620bd8d65cebb389b305b9299a5a3b11d547bba59759a6`; o texto novo de proteção contra conflito está no módulo servido.

A sessão autenticada preexistente abriu Dashboard, Agenda e Histórico após o deploy; dados, controles, datas e descrição atualizada carregaram. Nenhuma avaliação ou nota de produção foi modificada e nenhuma mensagem foi enviada. As abas temporárias de verificação foram fechadas.

Scanner imediatamente antes do commit: 386 arquivos sem padrões de credenciais detectados. A atualização posterior altera somente documentação.

Ver também `conferencia-operacional-2026-10-14.md`: primeira execução diária natural confirmada por leitura, com status success, sem candidatos ou mensagens no ciclo observado.

## Pendências preservadas

Observação prolongada/virada real de dia, versão completa da extração visual da agenda, recuperação entre dispositivos, revisão de containers, restore integral, rotação de credenciais e observação operacional dos jobs seguem no handoff. Este lote não encerra a auditoria geral.
