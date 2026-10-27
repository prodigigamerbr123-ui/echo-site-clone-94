# Conferência operacional — 13/10/2026, 16h17 Brasília

Leituras por SSH na VM 157.151.12.122. Nenhum envio, chamada de IA,
execução manual de automação ou alteração de dados de produção.

- Serviços principais de produção saudáveis no Docker; SSH disponível.
- Três alunos e uma conta preservados.
- Migrations 20261013010000, 20261013020000 e 20261013030000 registradas.
- Dois jobs ativos: fila a cada minuto; automação diária `0 11 * * *`,
  correspondente a 08h de Brasília.
- Últimas quatro invocações do disparador da fila registradas como succeeded.
  Esse resultado comprova o disparo SQL, não a entrega de mensagens.
- Invocações diárias de 12 e 13/10 registradas como succeeded no pg_cron.
  A invocação de 13/10 aconteceu antes da publicação do novo histórico.
- `automation_runs` ainda vazio. Primeira execução natural esperada após
  a publicação: 14/10/2026 às 08h de Brasília. Resultado ainda não conferido.
- Fila: 19 sent, 35 failed, quatro cancelled; nenhum pending ou processing.
  Os 35 failed têm última atualização em 11/10/2026 às 04h UTC.
  Não são falhas novas deste deploy; causa e possibilidade de reenvio não
  foram inferidas, e não houve tentativa automática de reenviá-los.

Os registros de publicação mais recentes confirmam backup validado, backend,
migrations, frontend, tipos e lint já concluídos. As tabelas anteriores que
marcavam esses trabalhos como pendentes estavam desatualizadas.

Pendências reais: primeira execução diária com o novo histórico; alinhamento
das consultas/regras de IA, agenda e cobranças (B12); validação do provedor
real de IA, ainda não coberta pelo teste simulado; evolução de arquitetura e
histórico com filtros no servidor. Envio real de WhatsApp já havia sido
confirmado pelo usuário; não precisa ser repetido apenas para marcar a tabela.
