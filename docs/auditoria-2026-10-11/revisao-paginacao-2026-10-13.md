# Revisão de paginação — 13/10/2026

Estado: implementado localmente; sem publicação nesta rodada.

Corrigidas as consultas de alunos e modelos nas telas Mensagens e
AgendarMensagemForm, alunos e fila em ScheduledList, alunos e histórico em
MensagensEnviadasTab, alunos/avaliações/checagem de conflitos na agenda e
contadores por tipo dos últimos 30 dias em Automações.

O helper fetchAllPages lê páginas de 500 com count exact. Todas as consultas
usam ID como desempate da ordenação. Um erro em qualquer página rejeita a
consulta inteira. Se a API devolver menos linhas que a contagem informa,
o helper acusa dados incompletos em vez de considerar a primeira página como
lista completa. Nas telas de mensagens são apresentados avisos de erro.
Não foi alterada a autorização nem acionado o worker.

Validação local: 10 suítes / 77 testes aprovados, TypeScript aprovado, build
aprovado e diff check sem erros (configuração de CRLF do Windows).
Os quatro testes novos cobrem 1.005 registros, erro na segunda página,
limite da API inferior ao tamanho solicitado, lista vazia e fim numa página
cheia. Esses ensaios usam respostas simuladas e não substituem a validação
das telas contra o staging.

Limites: estas consultas ainda carregam o conjunto completo para os filtros
locais existentes. A próxima evolução para históricos grandes é filtrar e
paginar a exibição no servidor, com agregações para contadores. Paginação por
offset não representa uma fotografia transacional: escritas concorrentes
podem deslocar registros durante a leitura; ID como desempate resolve
empates, mas não esse deslocamento.

O carregamento de páginas sob demanda implementado em App.tsx também está
local. O build atual tem entrada JavaScript de 423,44 kB (121,24 kB gzip);
a medição anterior era 1.060,33 kB (305,88 kB gzip). A divisão não é uma
medição de tempo de carregamento no navegador.

Próxima etapa da tabela: validação visual em staging e preparação da
publicação coordenada com migration, função de automação e frontend.

## Conferência das telas no staging

Frontend local atual conectado à API exclusiva de staging por túnel SSH.
Login com conta temporária aprovado. Atalho do dashboard abriu o formulário
em modo Agendar; lista de seis alunos da cópia carregou pela consulta nova.
Agenda carregou alunos e avaliações, caixa de saída carregou as abas
Agendadas e Enviadas e Automações mostrou histórico, última execução
bem-sucedida e contadores por tipo.

Viewport 390x844: agenda e caixa de saída com largura de conteúdo 375px,
sem transbordamento horizontal. Menu com título/descrição acessíveis
fechou após navegação. Automações conferida também em 1280x900.
Nenhum erro ou aviso capturado pelo console da aba nas telas visitadas.
O popover da agenda e gráficos não foram exercitados nesta rodada.

Não foram criadas mensagens ou avaliações, nem alteradas configurações
pela interface. Conta temporária removida, aba fechada e viewport restaurado.
Produção sem implantação nesta rodada.
A base visual de seis alunos não comprova o cenário de alto volume;
esse cenário continua coberto pelos testes locais e pela validação
anterior do motor com 1.005 fixtures no staging.

Etapas 7 e 8: consultas corrigidas e telas acima conferidas em staging.
Pendências: publicação coordenada e validação após publicação, além da
dívida de tipos/lint e melhorias de arquitetura.
