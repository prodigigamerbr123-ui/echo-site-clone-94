# Auditoria do WorkOut — 11 de outubro de 2026

Repositório: `prodigigamerbr123-ui/echo-site-clone-94`. Referência analisada: `47bd12417c721dbeb49442723d5ffb3e8b7c2626`, branch `main`.

Este relatório registra o estado anterior às correções. As referências ao código apontam para o commit auditado.

## Parecer

O projeto já reúne funcionalidades úteis, mas ainda tem a estrutura de um protótipo que foi crescendo por adição de telas. O maior problema é a falta de uma fonte única para as regras de negócio: ações importantes são implementadas no navegador, repetidas no assistente de IA e parcialmente implementadas no banco. Isso prejudica a previsibilidade dos envios e a consistência dos dados.

React, TypeScript, Supabase e PostgreSQL atendem bem a este sistema. A evolução recomendada é gradual: corrigir envios duplicados e permissões, tornar as operações atômicas e depois melhorar os fluxos da academia. Uma reescrita completa teria custo e risco desnecessários.

Há bugs reais e riscos relevantes. O resultado desta auditoria não demonstra invasão, vazamento já ocorrido nem acesso público atual ao banco.

## Escopo e evidências

Foram inventariados os módulos do frontend, examinadas as rotas e os fluxos principais, as 10 Edge Functions, os helpers compartilhados, as 20 migrations, a autenticação, a fila, a IA, os templates e o workflow de publicação. O lint examinou 154 arquivos TypeScript/TSX. Também houve busca de padrões de risco e inspeção limitada do histórico Git de configurações e backend.

No site publicado foram conferidos o login, dashboard, lista de alunos, agenda e tela de mensagens. A busca da lista de alunos foi reproduzida sem modificar cadastros. As reproduções de telefone e recorrência foram locais e usaram dados fictícios. Nenhuma mensagem foi enviada e nenhum cadastro, avaliação ou configuração de produção foi alterado.

Não houve acesso administrativo ao Supabase, à Evolution, ao DNS ou à configuração de hospedagem. Portanto, políticas efetivamente aplicadas, cadastro público, MFA, backups, cron, limites da API e versões implantadas continuam dependendo de verificação em produção. As funções Deno e as migrations foram analisadas estaticamente; não foram executadas contra um banco de teste. A cópia local não tinha Deno disponível.

| Verificação | Resultado | Interpretação |
| --- | --- | --- |
| `npm ci` | Concluiu | Instalação reproduzível pelo lockfile |
| `npm run build` | Passou | Gera o frontend; não valida as Edge Functions nem a configuração real do banco |
| `npx tsc --noEmit -p tsconfig.app.json` | Passou | Tipos do frontend, com configuração permissiva |
| `npm run lint` / ESLint JSON | 142 erros, 19 avisos | Principalmente uso de `any`; não são 142 bugs comprovados |
| Testes sem variáveis locais | 1 suíte falhou; 10 testes passaram | Importação do cliente Supabase exige configuração mesmo no teste de filtro |
| Testes com URL/chave fictícias, sem acesso ao banco | 3 suítes, 12 testes passaram | 1 teste é apenas `expect(true).toBe(true)`; cobertura de negócio é pequena |
| Auditoria npm completa | 37 alertas: 2 críticos, 28 altos, 7 moderados | Contagem de pacotes afetados, incluindo alertas propagados por dependências |
| Auditoria npm sem dependências de desenvolvimento | 18 alertas: 16 altos, 2 moderados | Parte desses pacotes é ferramenta de CSS/build, mesmo classificada nessa árvore |
| Bundle principal | 1.076,71 kB; 310,82 kB gzip | As telas são carregadas juntas |
| Histórico inspecionado | JWTs encontrados com papel `anon`; nenhum `service_role` detectado nessa busca | Chave pública do Supabase é esperada no frontend; não é evidência de segredo administrativo exposto |

Classificação: **alta** = prioridade por risco aos dados ou aos envios; **média** = inconsistência funcional/operacional relevante; **melhoria** = evolução do produto. “Confirmado no código” significa que o caminho está demonstrado na fonte; não significa que o incidente ocorreu em produção.

## Segurança

### S01 — Qualquer usuário autenticado tem acesso total ao sistema — alta

**Confirmado nas migrations.** A política final usa `FOR ALL TO authenticated USING (true) WITH CHECK (true)` para alunos, mensagens, avaliações, configurações e conversas de IA. Não há distinção entre administrador, recepção e avaliador, nem vínculo de usuário com uma academia.

Isso permite que qualquer conta autenticada no mesmo projeto leia e altere todos os dados, inclusive CPF, telefone, observações e histórico. Se o cadastro de usuários ou o login anônimo estiver habilitado no Supabase, o impacto aumenta; essa configuração não foi verificada. Com uma única academia e contas estritamente administrativas, o risco é menor, mas ainda não há permissões para a equipe.

**Recomendação:** acesso por convite, contas individuais e papéis `admin`, `recepcao` e `avaliador`. Implementar as permissões no banco e nas funções. Se houver plano de vender o sistema para outras academias, adicionar `academy_id` e associação usuário–academia antes de receber a segunda academia. A política precisa usar essa associação.

Fonte: [20260716001135_a7b256e3-eb46-469e-946f-327e1ff5672a.sql:35](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/migrations/20260716001135_a7b256e3-eb46-469e-946f-327e1ff5672a.sql#L35) e [20260716184011_b1816ba3-cd14-4054-95d9-35a242f764c2.sql:12](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/migrations/20260716184011_b1816ba3-cd14-4054-95d9-35a242f764c2.sql#L12). A [documentação de RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) descreve o controle aplicado às linhas.

**Cuidado com falso positivo:** as migrations antigas realmente concediam acesso a `anon`, mas uma migration posterior revoga esse acesso. Não estou classificando aquelas políticas antigas como a política final do repositório.

### S02 — APIs administrativas verificam login, mas não a autorização da ação — alta

**Confirmado no código.** `requireUser` verifica o token, mas não devolve uma identidade autorizada nem verifica papel ou vínculo. A mesma validação permite consultar QR, conectar e desconectar o WhatsApp. A IA e o briefing usam uma chave administrativa para acessar o banco depois dessa validação genérica.

A chave administrativa tem uso legítimo no worker; nos endpoints interativos, ela exige verificações explícitas de quais dados o usuário pode acessar. Hoje essas verificações não existem. Adicionar apenas novas políticas RLS sem ajustar a IA deixaria esse caminho usando privilégio elevado.

**Recomendação:** helper que retorna usuário e permissões; token do usuário para consultas comuns; privilégio administrativo restrito a operações internas que precisem dele; permissões específicas para pareamento, logout, envio em lote e acesso a avaliações. Registrar autor e resultado das ações importantes.

Fontes: [auth.ts:14](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/_shared/auth.ts#L14), [index.ts:483](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/ai-assistant/index.ts#L483), [index.ts:76](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/whatsapp-status/index.ts#L76).

### S03 — Endpoint de envio aceita telefone e identidade enviados pelo navegador — alta

**Confirmado no código.** `send-whatsapp` recebe uma lista com `id`, nome e telefone, e envia para o telefone recebido. Não resolve o destinatário a partir de um cadastro autorizado. Também não impõe limite de destinatários por requisição nem usa a mesma fila da tela principal.

Um usuário autenticado pode usar esse endpoint para enviar pelo WhatsApp da academia a números externos e associar o registro a um aluno diferente. O envio acontece antes de gravar o histórico; uma falha de referência no histórico não desfaz a mensagem já enviada.

**Recomendação:** aceitar somente IDs autorizados, resolver os telefones no servidor, validar consentimento/bloqueios e colocar os envios numa única fila. Retirar ou limitar a função antiga quando o fluxo pela fila estiver consolidado.

Fonte: [index.ts:39](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/send-whatsapp/index.ts#L39).

### S04 — Ações de IA sem validação forte, limite e identidade persistente — alta

**Confirmado no código.** A função recebe `messages` e `confirmedAction.args` diretamente do cliente. Não aplica schema de validação do lado do servidor, limite de tamanho do histórico, quota por usuário nem identificador persistente para garantir execução única. A confirmação visual não é registrada como uma ação pendente autorizada no servidor.

Uma requisição repetida pode repetir uma escrita. Um agendamento criado com sucesso seguido de erro na chamada que resume o resultado pode aparecer como falha para a pessoa, incentivando outra tentativa. O modelo é usado também para responder sobre uma ação que já foi realizada.

**Recomendação:** validar entradas com schemas, persistir `pending_action` com usuário, argumentos, validade e estado, confirmar pelo ID e impedir repetição. Retornar o resultado da operação em formato estruturado, independentemente de a IA conseguir escrever um resumo. Limitar chamadas e tamanho de contexto; permitir apenas papéis de mensagem esperados. Aplicar as mesmas regras usadas pela interface normal.

Fonte: [index.ts:495](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/ai-assistant/index.ts#L495).

### S05 — Dependências precisam de atualização e avaliação de alcance — alta

**Confirmado pelo npm audit em 11/10/2026.** Há 37 alertas na árvore completa. Os dois pacotes classificados como críticos são `tinypool` e `vitest`; o risco principal é no ambiente de desenvolvimento/teste. Os avisos do Tinypool dependem de uma condição de prototype pollution e não demonstram execução remota no site estático. Ver [aviso do Tinypool](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) e [segundo aviso do Tinypool](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).

Também há alertas em React Router, Vite, Rollup, PostCSS, Tailwind e dependências transitivas. O [aviso do React Router](https://github.com/advisories/GHSA-2w69-qvjg-hvjx) exige análise do fluxo de redirecionamento atingível. O app utiliza rotas comuns com caminhos conhecidos; não reproduzi um exploit de redirecionamento ou XSS nele.

**Recomendação:** atualização em etapas, começando pelos pacotes com correções compatíveis; avaliar migrações maiores de ferramentas separadamente; atualizar o lockfile e rodar build e testes. Configurar alertas de dependências. `npm audit fix --force` não deve ser o plano de atualização: o próprio audit sugere alterações de versões principais e até downgrades para resolver algumas cadeias.

Evidências detalhadas: [auditoria npm completa](<C:/Users/pejon/OneDrive/Ambiente de Trabalho/recuperar loja ttk/wkt 2.0/docs/auditoria-2026-10-11/npm-audit.json>) e [auditoria npm sem dev](<C:/Users/pejon/OneDrive/Ambiente de Trabalho/recuperar loja ttk/wkt 2.0/docs/auditoria-2026-10-11/npm-audit-prod.json>).

### S06 — Conta administrativa e tratamento de dados merecem endurecimento — alta para a conta; melhoria para o desenho de dados

O acesso fornecido funcionou no site publicado. A senha fornecida é curta e a conta é genérica. Não há no app um fluxo de administração de usuários, recuperação de acesso ou MFA. A configuração de MFA e de proteção do login no Supabase não foi inspecionada.

**Recomendação:** substituir a conta compartilhada por contas individuais, usar senha forte e MFA administrativo, configurar recuperação com um e-mail controlado e revisar quem pode criar contas. Para CPF e observações pessoais, limitar visualização, minimizar dados enviados à IA, limitar retenção de logs e ter política de backup e restauração. Não foi identificado segredo `service_role` no recorte do histórico analisado; não há motivo para tratar a chave pública `anon` como senha.

## Bugs e confiabilidade dos envios

### B01 — Recorrência multiplica mensagens — alta

**Confirmado por leitura e simulação local, sem envios.** A tela cria todas as repetições e grava em cada uma `recurrence_count` com o total original. Quando cada repetição é enviada, o worker cria mais uma repetição com contador decrementado.

Exemplo: uma mensagem inicial e quatro repetições semanais deveriam resultar em cinco envios. Com sucesso em todos os envios e sem bloqueios, a implementação pode produzir **17**: uma inicial e 16 recorrentes. As semanas recebem 1, 2, 3, 4, 3, 2 e 1 mensagens. Há envios além da data final esperada.

**Correção recomendada:** escolher um único modelo. Ou o servidor cria uma série e agenda cada ocorrência uma vez, ou cria só a próxima ocorrência após cada envio. Usar `series_id`, número da ocorrência e índice único. O usuário precisa poder pausar ou cancelar a série inteira.

Fontes: [Mensagens.tsx:191](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/Mensagens.tsx#L191), [index.ts:180](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/process-scheduled-messages/index.ts#L180). O formulário legado também repete esse padrão.

### B02 — Agendamento e remarcação podem indicar sucesso sem criar lembretes — alta

**Confirmado no código.** A agenda cria/altera a avaliação e depois insere as mensagens, mas não verifica o erro dessa inserção. Informa a quantidade pretendida, mesmo se o banco rejeitar o lote. Cancelamento e remarcação apagam mensagens antes de concluir a alteração da avaliação, em requisições separadas.

O backend da IA contém uma tentativa de rollback na criação, mas o caminho da tela não usa essa função. Falhas de rede ou de banco podem deixar avaliação sem lembretes ou avaliação antiga sem as mensagens que deveria ter.

**Correção recomendada:** uma operação transacional no servidor/banco para criar/remarcar/cancelar a avaliação e seus itens de fila. Verificar todas as respostas e devolver resultado real. Incluir identidade da operação para a repetição de uma requisição não criar outra avaliação.

Fontes: [AgendarAvaliacao.tsx:295](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L295), [AgendarAvaliacao.tsx:351](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L351), [AgendarAvaliacao.tsx:380](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L380), [evaluations.ts:239](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/_shared/evaluations.ts#L239).

### B03 — Cancelar ou editar não protege mensagens já capturadas pelo worker — alta

**Condição de corrida demonstrada na estrutura do código; não provocada em produção.** Cancelamento e conclusão apagam apenas mensagens `pending`. O worker já pode ter capturado uma delas como `processing`, aguardando o delay, e mantém uma cópia em memória. Antes de enviar, não verifica novamente se a avaliação foi cancelada/remarcada.

A edição da caixa de saída também atualiza por ID sem exigir que a mensagem continue `pending`; uma tela antiga pode devolver à fila uma mensagem que outro processo já capturou.

**Correção recomendada:** transições condicionais de estado, versionamento da avaliação e checagem antes do despacho. Mensagens já enviadas ao provedor não podem ser desfeitas; a interface deve explicar essa janela. Cancelar a intenção pendente e conservar histórico é preferível a excluir a linha.

Fontes: [AgendarAvaliacao.tsx:84](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L84), [index.ts:82](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/process-scheduled-messages/index.ts#L82), [ScheduledList.tsx:95](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/mensagens/ScheduledList.tsx#L95).

### B04 — Lembretes antigos e cobranças obsoletas continuam elegíveis — alta

**Confirmado no código; ocorrência depende do estado da fila.** O worker envia qualquer item vencido. Revalida status do aluno e telefone, mas não valida a situação da avaliação, o vencimento atual, o consentimento, a automação ainda habilitada ou a validade temporal do texto.

Depois de uma indisponibilidade, um lembrete escrito como “amanhã” pode sair depois da avaliação. Se o vencimento for atualizado antes do envio, uma cobrança já enfileirada permanece com o texto antigo. Desligar uma automação impede algumas criações novas, mas não interrompe suas mensagens já pendentes.

**Correção recomendada:** `expires_at`, vínculo com a origem da mensagem e regras reavaliadas no despacho. Permitir pausar a fila e cancelar pendências de uma automação. Cobranças devem se vincular a uma mensalidade específica e ao seu estado atual.

Fonte: [index.ts:82](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/process-scheduled-messages/index.ts#L82).

### B05 — Limites de envio não são globais e os workers podem se sobrepor — alta

**Risco confirmado no desenho; volume efetivo depende da produção.** Cada execução captura até 12 mensagens; o cron dispara a cada minuto. Os delays de 5–15 segundos são locais a cada execução. Uma execução longa pode coexistir com a próxima, enviando a partir de lotes diferentes ao mesmo tempo. O lock evita capturar a mesma linha, mas não controla a taxa total da instância WhatsApp.

Onze pausas podem somar até 165 segundos, antes de considerar rede e banco. A chamada de envio não tem timeout explícito. Há risco de atingir os [limites de execução das Edge Functions](https://supabase.com/docs/guides/functions/limits), especialmente no plano gratuito, e deixar itens sem processamento concluído.

**Correção recomendada:** limite global por instância, orçamento de execução e lote ajustado ao tempo disponível. Verificar conexão antes de capturar um lote; tratar indisponibilidade como pausa, evitando consumir todas as tentativas enquanto o telefone está desconectado. Adicionar timeout com tratamento de entrega incerta. O delay atual não comprova proteção contra bloqueio da conta.

Fontes: [index.ts:13](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/process-scheduled-messages/index.ts#L13), [20261003000000_rewire_automation_cron.sql:69](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/migrations/20261003000000_rewire_automation_cron.sql#L69), [evolution.ts:67](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/_shared/evolution.ts#L67).

### B06 — Resposta de envio incerta pode ser tratada como falha que permite retry — alta

**Confirmado no código; depende da resposta do provedor.** Exceções de rede levam à revisão manual, o que é um cuidado útil. Porém, uma resposta HTTP de sucesso sem o ID esperado retorna `ok: false`; o worker faz retry automático nesse caminho. Uma resposta diferente ou incompleta pode coexistir com envio aceito pelo provedor.

**Correção recomendada:** distinguir rejeição comprovada, indisponibilidade antes do envio e resultado incerto após o envio. Usar ID do provedor, ID de correlação e reconciliação. Na caixa de saída, reenviar resultado incerto deve exigir conferência explícita. Não prometer “exatamente uma entrega” sem suporte de idempotência do provedor.

Fontes: [evolution.ts:95](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/_shared/evolution.ts#L95), [index.ts:248](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/process-scheduled-messages/index.ts#L248), [ScheduledList.tsx:123](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/mensagens/ScheduledList.tsx#L123).

### B07 — Histórico e contadores confundem aceitação, falha e entrega — média

**Confirmado no código.** O worker marca `sent` quando o provedor retorna ID; não há processamento de recibos de entrega/leitura no repositório. O dashboard descreve esse número como “já entregues”. O endpoint antigo grava tentativas com `status: failed` na tabela `messages`, mas o contador de enviadas conta todas as linhas pelo horário, sem filtrar status.

Além disso, a fila é marcada como enviada antes da inserção no histórico. Se o histórico falhar, o item enviado não aparece nas telas que consultam só `messages`. A mensagem também desaparece das abas de pendentes/falhas enquanto está `processing`.

**Correção recomendada:** estados distintos (`queued`, `sending`, `accepted`, `delivered`, `read`, `failed`, `uncertain`, `cancelled`), ID do provedor e vínculo único entre fila e histórico. Separar eventos/tentativas da mensagem. Mostrar todos os estados na caixa de saída e usar métricas que correspondam aos dados disponíveis.

Fontes: [useDashboardData.ts:66](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/hooks/useDashboardData.ts#L66), [StatsOverview.tsx:166](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/dashboard/StatsOverview.tsx#L166), [index.ts:108](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/send-whatsapp/index.ts#L108), [index.ts:170](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/process-scheduled-messages/index.ts#L170), [CaixaDeSaida.tsx:21](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/CaixaDeSaida.tsx#L21).

### B08 — Busca de alunos por texto mantém todos os registros — média

**Reproduzido no site publicado e localmente.** O filtro procura CPF com os dígitos extraídos da busca. Quando a busca contém só letras, resulta em string vazia. Todo CPF, inclusive ausente, contém a string vazia, tornando o filtro verdadeiro.

**Correção recomendada:** só testar CPF quando houver dígitos; normalizar separadamente nome, telefone e CPF. Fazer busca e paginação no servidor quando a base crescer. Testar nome inexistente, acentos, telefone com máscara e CPF parcial.

Fonte: [ListaAlunos.tsx:190](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/alunos/ListaAlunos.tsx#L190).

### B09 — Telefones com DDD 55 são rejeitados — média

**Reproduzido localmente usando o helper real.** O normalizador identifica DDI apenas por `startsWith("55")`. Um número brasileiro de 10/11 dígitos com DDD 55 é confundido com um número que já contém o DDI e falha na validação.

**Correção recomendada:** decidir pelo comprimento e formato, distinguindo número nacional de 10/11 dígitos de número com DDI de 12/13 dígitos. Armazenar o número normalizado e compartilhar um único normalizador entre frontend e backend.

Fontes: [phone.ts:16](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/lib/phone.ts#L16), [phone.ts:24](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/_shared/phone.ts#L24).

### B10 — Horário 00:xx vira 09:xx na agenda — média

**Confirmado no código.** O horário é construído com `ch || 9` e `rh || 9`. Como zero é falso em JavaScript, hora zero vira nove. Ainda que a academia não use a madrugada, isso é uma transformação silenciosa do valor digitado.

**Correção recomendada:** validar inteiros e usar fallback somente para ausência ou valor inválido; restringir aos horários de funcionamento com mensagem clara.

Fonte: [AgendarAvaliacao.tsx:323](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L323), [AgendarAvaliacao.tsx:385](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L385).

### B11 — Concluir uma avaliação antiga pode retroceder a última avaliação do aluno — média

**Confirmado na função SQL.** `complete_evaluation_tx` sempre sobrescreve `last_evaluation_date` com a data do compromisso concluído. Fechar um compromisso antigo depois de um recente faz o aluno parecer menos atualizado. A função também aceita repetir a conclusão ou concluir compromisso cancelado/futuro sem validar a transição.

Ao fechar uma avaliação antiga, o follow-up é calculado a partir da data agendada e pode nascer já vencido. A inserção do follow-up em vários caminhos ignora erros e ainda informa sucesso.

**Correção recomendada:** distinguir data agendada de data realizada, validar transições e derivar a última avaliação a partir do histórico válido. Conclusão e criação do follow-up devem ser idempotentes e usar política explícita para lançamentos retroativos.

Fontes: [20260720112246_5d8a59db-fa88-4572-ae53-ba8b2c6cf24e.sql:32](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/migrations/20260720112246_5d8a59db-fa88-4572-ae53-ba8b2c6cf24e.sql#L32), [AgendarAvaliacao.tsx:490](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L490).

### B12 — IA, agenda e dashboard discordam das regras — média

**Confirmado no código.** A agenda permite confirmar um conflito; a IA bloqueia conflito em intervalo de 30 minutos. A automação usa dias configuráveis, a agenda considera 90 dias e as sugestões do dashboard usam 7 dias. No site, o dashboard e o atalho de alunos também mostraram contagens diferentes de mensalidades vencidas porque nem todos usam a mesma população de alunos.

**Correção recomendada:** um serviço de domínio para elegibilidade, conflito, conclusão e envio. Separar claramente “sem avaliação”, “avaliação vencida” e “compromisso sem fechamento”. Definir se métricas financeiras incluem inativos e indicar isso nos rótulos.

Fontes: [AgendarAvaliacao.tsx:253](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AgendarAvaliacao.tsx#L253), [index.ts:360](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/ai-assistant/index.ts#L360), [useDashboardData.ts:214](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/hooks/useDashboardData.ts#L214), [index.ts:149](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/daily-automation/index.ts#L149).

### B13 — Atalho de agendamento abre o modo de envio imediato — média

**Confirmado nas rotas e estado da tela.** O atalho usa `/mensagens?tab=agendar`, mas `Mensagens` inicia `mode` como `now` e lê apenas o parâmetro de aluno.

**Correção recomendada:** inicializar o modo pela URL e manter a URL sincronizada ao trocar o modo. Descrever claramente a diferença entre enfileirar agora e escolher horário.

Fontes: [QuickActions.tsx:57](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/dashboard/QuickActions.tsx#L57), [Mensagens.tsx:47](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/Mensagens.tsx#L47).

### B14 — IA perde estado ao criar a primeira conversa e não persiste o card de ação — média

**Risco de corrida confirmado no código; não reproduzido com uma chamada paga.** Ao criar a conversa, o pai troca a `key` do `AIChat`, remontando o componente enquanto a primeira chamada continua no componente antigo. A nova tela pode carregar só a mensagem do usuário, sem a resposta que chega depois. O histórico persiste somente `role` e `content`, sem `pendingAction` nem seu estado.

**Correção recomendada:** manter o componente estável durante a criação, cancelar/identificar requisições antigas e carregar o histórico após a conclusão. Persistir proposta, confirmação, execução e resultado. Um card pendente precisa continuar revisável após recarregar a página.

Fontes: [AssistenteIA.tsx:90](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/AssistenteIA.tsx#L90), [AIChat.tsx:104](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/ai-assistant/AIChat.tsx#L104), [AIChat.tsx:108](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/ai-assistant/AIChat.tsx#L108).

### B15 — Consultas podem truncar silenciosamente os dados — média

**Confirmado no código; limiar depende da configuração da API.** Alunos na lista principal são paginados, mas a tela de mensagens usa uma única consulta com `.limit(5000)`. Avaliações, histórico de envios e leituras auxiliares da automação também usam consultas sem paginação. O limite de resposta do Supabase pode ser menor que esse número solicitado.

É especialmente preocupante no histórico usado para respeitar o máximo de tentativas e o intervalo entre convites: se parte do histórico não chegar, o sistema pode contar tentativas a menos e enviar novamente.

**Correção recomendada:** filtros e paginação no servidor; agregações SQL para contadores e elegibilidade; consultas determinísticas com ordenação estável. Testar uma base maior que o limite da API. Não resolver isso apenas aumentando o limite global.

Fontes: [Mensagens.tsx:63](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/Mensagens.tsx#L63), [index.ts:260](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/daily-automation/index.ts#L260), [MensagensEnviadasTab.tsx:44](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/mensagens/MensagensEnviadasTab.tsx#L44).

### B16 — Cobrança de vencido pode não ligar num banco criado pelas migrations — média

**Confirmado para instalação a partir apenas do repositório.** A interface oferece `payment_overdue`, mas as migrations não inserem essa chave em `automation_settings`. O toggle faz `update`, não `upsert`, e não verifica se alguma linha foi alterada. Assim, pode anunciar sucesso sem persistir a ativação. A presença da chave em produção não foi verificada.

O motor também aplica o limite de lembretes e de cobranças em listas separadas; o comentário diz que o cap é compartilhado, mas o código pode gerar até dois caps.

**Correção recomendada:** seed completo e versionado das automações, resultado de atualização verificado e limite diário central que inclua todos os tipos.

Fontes: [Automacoes.tsx:229](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/Automacoes.tsx#L229), [20260429000000_recovered_base_schema.sql:97](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/migrations/20260429000000_recovered_base_schema.sql#L97), [index.ts:399](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/daily-automation/index.ts#L399).

### B17 — Saúde da automação é inferida por mensagens, não pelas execuções — média

**Confirmado no código.** “Última execução do motor” usa a data de criação da última mensagem de aniversário/convite. Se o motor executar corretamente sem candidatos, a data não muda; se ele falhar, a tela também não explica por quê. O banner de falha/desconexão desaparece após 15 segundos e fica dispensado na sessão.

**Correção recomendada:** registrar cada execução com início, término, estado, contadores e erro; mostrar última execução bem-sucedida e fila atrasada. Manter um indicador discreto e persistente enquanto houver falha operacional. Notificações transitórias podem complementar esse estado.

Fontes: [Automacoes.tsx:174](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/pages/Automacoes.tsx#L174), [SystemHealthBanner.tsx:9](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/src/components/layout/SystemHealthBanner.tsx#L9).

### B18 — Cache do backend pode conservar template antigo — média

**Confirmado no desenho do cache; depende da reutilização da instância.** O helper de templates das Edge Functions mantém um `Map` global sem validade nem invalidação. Alterações do template com o mesmo ID podem não ser percebidas pela instância aquecida da função. A limpeza de cache na interface não limpa o backend.

**Correção recomendada:** cache por versão/`updated_at`, prazo curto ou resolver o template sem cache durante o agendamento. Definir se editar o template deve atualizar mensagens já pendentes ou apenas agendamentos novos.

Fonte: [messageTemplates.ts:43](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/functions/_shared/messageTemplates.ts#L43).

## Melhorias que mais mudariam o uso diário

### 1. Transformar o dashboard numa lista de trabalho do dia

Priorizar, nesta ordem: WhatsApp/automação com problema, mensagens atrasadas ou incertas, avaliações de hoje e sem fechamento, alunos a contatar e mensalidades a conferir. Cada item deve abrir a ação já filtrada. Deixar os totais gerais menores e mais abaixo.

Hoje há muitos cartões numéricos e atalhos. Eles exigem que a pessoa interprete os números e procure a próxima tela. Já existem componentes como `TodayInbox`, mas não estão montados no dashboard atual e ainda repetem regras; podem servir de referência visual depois que o domínio estiver centralizado.

“Sugestões da IA” atualmente combina regras locais e textos predefinidos. Identificar isso como sugestões automáticas, indicar o motivo e evitar recomendar contato para quem já tem uma mensagem equivalente na fila. O objetivo deve ser resolver pendências e melhorar retenção, com um número controlado de contatos.

### 2. Ficha única do aluno e histórico cronológico

Uma página com dados, situação do plano, mensalidades, próxima avaliação, resultados de avaliações e todas as interações. Linha do tempo: cadastro, alteração de status, agendamento, falta, envio aceito/entregue, resposta e próximo acompanhamento.

Incluir etiquetas e segmentos úteis: primeira avaliação pendente, avaliação vencida, aniversariantes, retorno após inatividade e pagamentos a conferir. Normalizar telefone, permitir aviso de número compartilhado entre familiares e detectar CPF duplicado com mensagem amigável. Usar arquivamento para o fluxo normal de saída; atualmente excluir o aluno remove seu histórico por cascata.

Importação CSV/planilha deve ter prévia, validação, tratamento de duplicatas, relatório de linhas rejeitadas e rollback do lote. É mais valiosa para cadastrar a base real do que adicionar muitos indicadores decorativos.

### 3. Campanhas e automações com controle de frequência

Antes de um lote, mostrar motivo do segmento, quantidade válida, pessoas excluídas, texto personalizado de exemplo, janela e previsão de término. Usar uma campanha com estado e destinatários, permitindo pausar, cancelar pendências e reprocessar somente falhas comprovadas.

Adicionar preferência de contato/bloqueio, horários permitidos e limite por aluno que atravessa todos os tipos de mensagem. Um aniversário, cobrança e convite de avaliação no mesmo dia precisam respeitar uma política clara. O motor deve explicar por que incluiu ou excluiu cada pessoa.

Integrar respostas por webhook, caso o provedor utilizado suporte esse fluxo: quando o aluno responder ou agendar, pausar a sequência de insistência e criar tarefa para atendimento humano. O repositório atual trata saída, mas não contém um fluxo de caixa de entrada e suspensão por resposta.

### 4. Avaliação física com resultados e evolução

O módulo atual é principalmente agenda, comparecimento e observações. Não há modelo estruturado de medidas, resultados, protocolos ou evolução.

Se o objetivo inclui registrar a avaliação em si, criar uma sessão de avaliação com data realizada, profissional, protocolo, unidades e campos opcionais, resultados anteriores e comparação. Um conjunto inicial pode contemplar peso, altura, medidas corporais e observações do profissional, com validação de unidades e histórico de correções. Fotos e outros anexos devem ter acesso restrito.

Separar compromisso de avaliação do registro de resultados. Uma avaliação concluída pode ter resultados em elaboração; terminar um compromisso não deve inventar medidas nem sobrescrever registros históricos. Exportação para o aluno e gráficos de evolução vêm depois da estrutura de dados e permissões.

### 5. Mensalidades com registro de pagamento

Hoje o estado financeiro é inferido de uma única `payment_due_date`. Não existe no schema um histórico de mensalidades, valores, pagamento, período coberto ou estorno. Alterar a próxima data não registra o que foi pago.

Criar mensalidade por período com valor, vencimento, estado e registro de pagamento. “Marcar como pago” precisa atualizar esse registro e cancelar cobranças pendentes dessa mensalidade. Planos devem ser dados configuráveis, com duração e valor, em vez de apenas uma lista de strings dentro do formulário.

### 6. Indicadores de resultado

Medir avaliações agendadas a partir de convites, faltas, retorno de alunos, respostas às campanhas e redução de pendências. Exibir alcance e período de cada indicador. Contagem de mensagens enviadas sozinha não mostra se a comunicação ajudou a academia.

### 7. Experiência no celular e recuperação de erros

Na tela de mensagens, permitir segmentos de ativos/inativos e mostrar esse status antes de selecionar. A seleção por nome em um `div` deve ter operação por teclado e um checkbox com nome acessível. A interface atual usa rolagem e muitos cartões; priorizar ações frequentes e feedback persistente de operação.

A tela de IA reserva 260 pixels fixos para a lista de conversas, sem layout específico para celular. Tornar a lista recolhível. No restante do sistema, distinguir dado vazio de falha ao consultar, manter formulário após erro e permitir tentar novamente. Várias consultas ignoram erros e mostram zero/nenhum registro, o que pode passar falsa sensação de normalidade.

## Organização técnica recomendada

Manter uma aplicação única com módulos claros, sem necessidade de microserviços neste estágio.

1. **Interface:** coleta dados, mostra prévias e resultados. Não decide sozinha regras críticas nem escreve estados de entrega.
2. **Operações de domínio no servidor:** cadastro, agendamento, remarcação, conclusão, cobrança e campanha. Interface e IA chamam a mesma operação.
3. **Banco:** transações, permissões, estados válidos e índices de unicidade. Validar também o que pode ser alterado diretamente pela API pública do Supabase.
4. **Fila/outbox:** intenção de envio persistente, item com prazo de validade, tentativas e estado incerto. Worker respeita uma taxa global e revalida a elegibilidade.
5. **Adaptador WhatsApp:** encapsula formato de payload e resposta, timeouts, IDs, recibos e reconciliação. Permite trocar provedor sem refazer o produto.
6. **Observabilidade:** execução dos motores, saúde da fila e trilha de ações da equipe. Logs com correlação e dados pessoais reduzidos.

Modelo incremental sugerido: `staff_members` e papéis; `campaigns` e destinatários; `message_attempts`; `automation_runs`; `audit_events`; `evaluation_results`; `subscriptions`/`invoices`/`payments`; preferências de contato. Acrescentar `academy_id` se houver intenção concreta de várias academias. Não adicionar todas essas tabelas de uma vez sem um fluxo que as use.

É importante impedir escrita arbitrária de `sent_at`, status de entrega e campos calculados do aluno. Uma camada de serviço apenas no frontend não protege operações feitas diretamente na API do banco. Permissões e invariantes precisam existir no servidor/banco.

## Qualidade, performance e publicação

- Os 142 erros de lint incluem 131 ocorrências de `no-explicit-any`. Ativar rigor de tipos por módulo, começar por fila e avaliações e remover casts que escondem os contratos. O compilador hoje usa `strict: false` e `noImplicitAny: false`.
- A agenda tem 904 linhas e a lista de alunos, 779. Extrair serviços, hooks e componentes por responsabilidade. Evitar duplicar a regra em outro arquivo apenas para reduzir tamanho da tela.
- Há telas antigas redirecionadas, helpers e cartões antigos que não são usados no fluxo principal, incluindo um gráfico com dados fixos. Mapear imports e remover o que não tem uso, depois de confirmar as dependências. O gráfico fixo não está no dashboard atual; não foi tratado como métrica falsa exibida em produção.
- Carregar páginas por `React.lazy` e dividir bibliotecas pesadas quando necessário. O bundle principal tem aproximadamente 1,08 MB minificado. Centralizar estatísticas em consultas SQL agregadas: o dashboard atual faz muitas consultas sequenciais, algumas trazendo dados que só são usados para contar.
- Usar chave de cache por identidade/papel, limpar dados sensíveis no logout e padronizar invalidação. Evitar misturar estados locais de fetch e React Query para o mesmo tipo de dado sem política de atualização.
- O workflow atual publica o frontend sem executar testes, lint ou checagem explícita de tipos. Usa valores fictícios quando faltam secrets, permitindo publicar uma versão que compila e falha em execução. Exigir configuração válida antes de construir.
- A publicação das Edge Functions e a aplicação de migrations não estão automatizadas nesse workflow. Documentar versões compatíveis, preparar staging separado e aplicar alterações de banco de modo compatível com a versão anterior durante a transição.
- O cron é configurado por uma função que depende de secrets no Vault; as migrations atuais não a invocam automaticamente. Verificar que os jobs existem e estão ativos. O fato de mensagens serem criadas pela interface não demonstra que o worker foi instalado.
- O README tem apenas uma mensagem padrão do Lovable. Documentar instalação, variáveis, backend, configuração de cron, backup/restauração, testes e rollback.

Fontes: [tsconfig.app.json:19](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/tsconfig.app.json#L19), [deploy-pages.yml:34](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/.github/workflows/deploy-pages.yml#L34), [20261003000000_rewire_automation_cron.sql:8](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/supabase/migrations/20261003000000_rewire_automation_cron.sql#L8), [README.md:1](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/blob/47bd12417c721dbeb49442723d5ffb3e8b7c2626/README.md#L1).

## Plano de evolução por prioridade

| Etapa | Entrega | Critério de conclusão |
| --- | --- | --- |
| 1 — Conter risco operacional | Corrigir recorrência; uniformizar fila; remover envio direto arbitrário; reforçar conta/permissões; revisar dependências | Série com quatro repetições produz cinco intenções; destinatários são resolvidos no servidor; usuários sem papel administrativo não controlam o WhatsApp |
| 2 — Tornar as operações confiáveis | Transações de avaliação; execução única; validação no despacho; estados de mensagem e taxa global | Repetir requisição não duplica; falha não cria sucesso falso; cancelamento e remarcação preservam consistência; resultado incerto é revisável |
| 3 — Melhorar a operação da academia | Dashboard de pendências; ficha do aluno; segmentos; campanhas; arquivamento e importação com prévia | Usuário encontra e resolve pendências a partir de uma tela; histórico e destinatários ficam compreensíveis |
| 4 — Completar os domínios | Resultados de avaliação e evolução; mensalidades/pagamentos; respostas e indicadores de conversão | Avaliação tem resultados históricos; cobrança consulta mensalidade real; sequências param quando deixam de fazer sentido |

Se fosse necessário escolher apenas três trabalhos de maior retorno, escolheria: **fila confiável sem duplicatas**, **operações/permissões centralizadas no servidor**, e **ficha do aluno com painel de pendências**.

## Testes de aceitação prioritários para a próxima implementação

1. Agendar quatro repetições e verificar quantidade, datas e cancelamento da série.
2. Dois dispositivos agendarem simultaneamente para o mesmo aluno.
3. Falha na criação de lembretes sem anunciar sucesso incorreto.
4. Cancelar/remarcar durante processamento; verificar comportamento antes e depois do despacho ao provedor.
5. Envio aceito com falha posterior no banco; resposta sem ID; timeout após aceitação.
6. Desconexão longa e reconexão: nenhum lembrete vencido sai com data relativa obsoleta.
7. Mensalidade paga/atualizada antes da cobrança; aluno bloqueado ou automação pausada.
8. Requisição de confirmação da IA repetida; resposta da IA falhando após a operação concluir.
9. Recepção e avaliador tentando operações fora de suas permissões; acesso público negado.
10. Consultas com volume maior que o limite da API, especialmente histórico de tentativas.
11. Concluir avaliação antiga e manter correta a última avaliação do aluno.
12. Busca sem correspondência, DDD 55, parâmetros de rota, horário zero e uso por teclado/celular.

## Verificações de produção ainda necessárias

Acompanham o relatório consultas **somente de leitura** em [verificações de produção (SQL)](<C:/Users/pejon/OneDrive/Ambiente de Trabalho/recuperar loja ttk/wkt 2.0/docs/auditoria-2026-10-11/verificacoes-producao.sql>) para conferir políticas, seeds, índices, cron e volume da fila. Elas foram preparadas, mas não executadas no banco da academia.

Também precisam ser conferidos no painel de infraestrutura: cadastro público/anônimo, contas e MFA, backup e recuperação, permissões dos secrets, proteção de logs, acesso ao servidor Evolution, limites do plano e se o commit local corresponde ao backend publicado.

Este documento é uma auditoria técnica e um plano de melhoria com evidências. O trabalho desta etapa não alterou o comportamento da aplicação nem publicou correções.
