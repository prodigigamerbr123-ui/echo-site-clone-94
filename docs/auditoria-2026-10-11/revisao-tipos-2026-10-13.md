# Tipos e tratamento de erros — 13/10/2026

Estado: alterações locais; produção permanece no commit c62f87c.

Baseline desta rodada: 134 erros e 20 avisos. Após as correções: 73 erros
e 20 avisos. Permanecem 72 usos de any e um prefer-const. As regras não
foram desativadas ou rebaixadas.

Motor daily-automation passou a usar SupabaseClient com Database, tipos
de alunos/itens da fila e paginação genérica. Settings aceita somente
objetos JSON em params. Exceções são unknown e o código de erro é extraído
por guarda de tipo antes de ser registrado.

Tratamento de erros no cadastro/edição de alunos, agenda, composição de
mensagens, IA e configurações usa errorMessage para Error e erros do banco
em objetos comuns, com fallback para exceções malformadas. Linhas
agendadas usam o tipo Insert do banco.

Parâmetros e vínculos de modelos das automações usam Json e extração
validada de strings. fetchAutomationTemplateIds agora propaga falha da
consulta: anteriormente um erro parecia ausência de modelos automáticos
e deixava esses modelos disponíveis na composição manual.

Corrigidos escopo de variáveis de switch em ai-database-actions, import
ESM do plugin Tailwind, tipos redundantes de componentes e anotações
desnecessárias na navegação/agenda. Catches intencionalmente vazios
têm comentário explicando o tratamento.

Verificações: 11 suítes, 80 testes; TypeScript e build aprovados. Deno check
aprovado para daily-automation e ai-database-actions.
Staging repetiu as 17 verificações do motor, incluindo 1.005 alunos
fictícios, deduplicação, exclusão de execução concorrente, RLS/rede
isolada, cron inválido recusado e limite conjunto de cobranças.
Fixtures removidas e configurações/função do staging restauradas pelo
script. Produção não foi alterada nem houve pedidos a provedores.

Os avisos e erros restantes concentram-se no assistente de IA, helpers
de avaliação/Evolution, dashboard, ficha de aluno e notificações.
Refatorar por contrato real de dados, validando entradas externas;
não substituir any por casts que apenas escondam incompatibilidades.
