# Histórico de plano e vencimento

18/10/2026. Implementação local para revisão, sem publicação.

## Entrega

A ficha passa a mostrar quando o plano ou vencimento mudou e quais eram os valores anteriores. O título é “Histórico de plano e vencimento”, pois uma correção manual não comprova uma renovação comercial ou um pagamento.

- A nova tabela `student_plan_history` guarda aluno, plano anterior/novo, vencimento anterior/novo, instante da alteração e identidade autenticada quando disponível. A interface não exige contas individuais nem expõe uma separação de funcionários.
- Um trigger registra alterações feitas pela renovação, edição ou outros caminhos de atualização do aluno. Registro e mudança fazem parte da mesma transação; falha no histórico desfaz também a mudança e o cancelamento de lembretes antigos dessa transação.
- Valores iguais, tentativas condicionais que não alteram linhas e mudanças de outros campos não geram eventos. O cadastro inicial não é apresentado como uma renovação.
- Eventos anteriores não são reconstruídos. O histórico começa após aplicar a migração e a interface informa esse limite.
- Leitura é permitida aos perfis já existentes de administrador e recepção. Não há INSERT, UPDATE ou DELETE direto para a aplicação; um trigger com privilégio restrito faz a gravação. Isso não representa um registro inviolável contra administradores do banco.
- Mantida a exclusão administrativa já existente: excluir definitivamente um aluno também exclui esse histórico, assim como o restante dos dados relacionados. Não foi acrescentada retenção obrigatória.
- A ficha carrega cinco entradas recentes e oferece carregar as anteriores. Mostra a quantidade total, horário de Brasília, falha com tentativa de recuperação e ausência real de eventos sem esconder erros como uma lista vazia.

## Verificação

Node 22.23.3: **417 testes em 59 arquivos**, ESLint, TypeScript estrito, build e alcance aprovados. Novos testes PGlite aplicam migrações reais e conferem antes/depois, permissões, bloqueio de escrita direta, ausência de eventos falsos, identidade técnica nula, exclusão e rollback integrado com lembretes. Testes de interface conferem paginação, fuso, falha, recuperação e contagem indisponível.

O módulo da prévia respondeu HTTP 200. O adaptador temporário foi conferido em memória: mudar vencimento cria uma entrada; mudar somente status não cria outra. Isso não substitui inspeção visual no navegador nem homologação do banco remoto. Nenhuma mensagem real, IA paga, publicação ou operação de produção foi realizada.

## Demonstração e publicação

Prévia: `http://127.0.0.1:18091/.workout-preview.local/index.html#/alunos?aluno=demo-carla`.

Renove o plano de Carla ou ajuste seu vencimento pela edição; a ficha reaberta mostra o registro. Os exemplos reiniciam ao recarregar, pois o adaptador usa apenas memória.

Migração nova: `20261018220000_student_plan_history.sql`. Deve ser aplicada antes do frontend que consulta a tabela, junto da preparação das duas migrações locais anteriores. A alteração é aditiva e preserva clientes antigos. Backup verificado, validação em homologação e retorno continuam necessários antes de publicar. Num retorno, preservar a tabela e os eventos já capturados enquanto se reverte o frontend, sempre que possível; remover o histórico descarta evidência real.

Ficha, painel e revisão de resultados das avaliações foram aprovados na conversa. O cliente também aprovou este histórico (“achei legal, continue”). A etapa seguinte implementa preferência de contato para revisão; ver `PREFERENCIA-CONTATO-2026-10-18.md`. Data real de avaliação independente do agendamento continua evolução separada.
