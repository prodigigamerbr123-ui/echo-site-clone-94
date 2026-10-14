# Workout — transferência completa da auditoria

> Matriz consolidada de continuidade: [handoff.md](../handoff.md), na raiz do repositório, contém os 63 itens discutidos, estados, pendências e ordem de retomada. Este documento preserva o histórico detalhado.

> Estado mais recente: lote publicado em `892bb88`, workflow `38611036898` aprovado, 306 testes/36 arquivos. Homologação integrada e leitura autenticada de Dashboard/Agenda/Histórico em produção concluídas. Backup `20261014T175538Z` conferido em quatro arquivos no servidor e cópia local. Primeira automação natural de 14/10 às 08:00 de Brasília confirmada sem erro e sem candidatos. Ver `agenda-publicacao-2026-10-14.md` e `conferencia-operacional-2026-10-14.md` na pasta da auditoria. Os relatos anteriores de mudanças ainda locais abaixo são históricos e foram superados por essa entrega.

> Atualização local posterior: ver `docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md`. A agenda recebeu recuperação de tentativa anterior antes da duplicidade, recibos por identidade sem notas em texto, trava síncrona e renovação de datas/métricas. O histórico recebeu paginação, erro explícito e calendário de Brasília. A validação local passou a 298 testes em 35 arquivos; lint, tipos e build aprovados. README/runbook foram iniciados por outra conversa. Essas mudanças ainda não foram commitadas/publicadas; a fotografia de produção abaixo permanece histórica. A extração visual completa e as pendências operacionais/de segurança continuam abertas.

Data de consolidação: 14/10/2026. Este documento serve para continuar o trabalho em outra conversa. Foi elaborado a partir do histórico Git, código, configurações e relatórios locais. Os testes e resultados de produção citados são as últimas evidências registradas; não foram reexecutados para escrever este resumo.

## 1. Contexto, objetivo e decisões do cliente

O Workout é um sistema para uma academia: alunos, mensagens WhatsApp, automações de relacionamento e cobrança, agenda de avaliações físicas, modelos de mensagem e assistente de IA. O pedido foi auditar a aplicação, corrigir bugs, vulnerabilidades e decisões de implementação amadoras, melhorar a organização e operar o backend na VM Oracle.

O cliente autorizou a continuidade das correções e prefere blocos substanciais de trabalho. Evitar terminar cada pequena etapa pedindo “posso continuar?”. Pedir informação somente quando realmente necessária. Comunicar resultados com evidência e distinguir proposta, implementação, homologação e publicação.

Decisões que devem ser preservadas:

- Um usuário/senha compartilhado atende à operação atual, por pedido do cliente. Contas individuais e separação por funcionário não são requisitos pendentes.
- A aplicação continua exigindo autenticação e autorização no servidor. Login compartilhado não autoriza acesso público aos dados ou funções internas.
- Manter dados existentes e trabalho local alheio à mudança. Criar novas migrações; não reescrever migrações já aplicadas.
- Antes de alteração em produção: backup verificado, cópia independente e retorno documentado.
- Usar fixtures descartáveis em homologação. Testes automatizados não devem enviar WhatsApp real nem consumir IA paga.
- Houve testes reais de mensagem autorizados anteriormente, e o usuário confirmou recebimento. Isso não autoriza disparos futuros indiscriminados.
- Credenciais fornecidas no histórico não são reproduzidas neste documento. A rotação coordenada das credenciais expostas ainda precisa de confirmação/evidência.

## 2. Correção importante das últimas respostas

Algumas respostas da conversa repetiram a tabela inicial depois das correções. A afirmação de que ainda faltava corrigir “142 erros e 19 warnings” estava desatualizada. Esses eram os números do diagnóstico inicial.

O último bloco documentado passou com **zero erros e zero avisos de lint, 274 testes em 32 arquivos, tipos e build aprovados**. Diversas melhorias de arquitetura, segurança e desempenho já foram publicadas. A auditoria geral, entretanto, continua aberta.

A extração completa de `AgendarAvaliacao.tsx` para hook e componentes foi sugerida, mas não consta como implementada no ponto atual. Não confundir essa proposta com os refactors já publicados em alunos, automações, mensagens, autenticação e módulos compartilhados.

## 3. Identificação e arquitetura atual

| Recurso | Localização |
| --- | --- |
| Repositório | https://github.com/prodigigamerbr123-ui/echo-site-clone-94 |
| Pasta de trabalho | `C:\Users\pejon\OneDrive\Ambiente de Trabalho\recuperar loja ttk\wkt 2.0` |
| Site | https://workoutsaas.dpdns.org/#/ |
| Backend | https://backend.workoutsaas.dpdns.org |
| Frontend | React, TypeScript, Vite, Tailwind, shadcn/ui; GitHub Pages |
| Backend | Supabase self-hosted na VM Oracle: PostgreSQL, Auth, REST, Edge Functions e demais serviços |
| Mensageria | Evolution GO na VM, acionada por funções/worker; fila persistente no PostgreSQL |
| IA | Integração direta com Google Gemini; configuração no servidor |
| Infraestrutura | Docker, gateways Nginx/Envoy e componentes auxiliares |

O frontend não passou a falar com um PostgreSQL aberto na internet. O backend preserva as APIs e contratos Supabase, agora executados na VM. O Supabase Cloud deixou de ser o backend operacional conforme a migração documentada.

Estrutura importante:

- `src/pages/`: telas e rotas; `src/components/`: componentes, incluindo `ui/`.
- `src/hooks/`, `src/lib/`, `src/utils/`: comportamento e utilitários compartilhados.
- `src/integrations/`: cliente e integração Supabase.
- `src/test/`: testes de frontend, contratos e autorização com PGlite.
- `supabase/functions/`: funções Deno; `_shared/` contém contratos e regras reutilizadas.
- `supabase/migrations/`: alterações SQL ordenadas.
- `supabase/tests/`: verificações HTTP e instruções.
- `ops/`: operação, publicação, backup e homologação.
- `docs/auditoria-2026-10-11/`: evidências dos lotes da auditoria.

O `AGENTS.md` já existe com orientações do repositório. O `README.md` ainda está como placeholder do Lovable e precisa ser substituído por documentação real.

## 4. Diagnóstico inicial e evolução

No diagnóstico de 11/10, o lint tinha 142 erros e 19 avisos, principalmente uso de `any`. Isso não representava 142 bugs confirmados. O npm audit apresentava 37 alertas: 2 críticos, 28 altos e 7 moderados. O bundle principal tinha aproximadamente 1.076,71 kB, ou 310,82 kB gzip.

Havia pouca cobertura útil de testes, regras de negócio duplicadas, consultas truncadas por limites REST, fluxos de avaliações sem atomicidade suficiente, risco de multiplicar recorrências, ações da IA sem confirmação durável, métricas inconsistentes e respostas de erro que podiam revelar detalhes internos.

Os números iniciais de dependências e bundle são históricos. Não devem ser apresentados como inventário atual de vulnerabilidades ou como medição atual de performance.

## 5. Migração do Supabase Cloud para a VM

Foi implementada a migração do WORKOUT04, referência `guomwsidnwapizkprkmo`, para Supabase self-hosted na VM Oracle. Foram preservados logins e dados de negócio, com comparação de contagens e digests de nove tabelas no momento da migração. RLS, permissões, sequências e configurações relacionadas foram reconciliadas.

O frontend passou a usar o backend da VM. `.github/workout-backend.env` contém a configuração pública de URL e chave anônima/publicável, que é diferente de uma chave privilegiada. Tipos de banco ficam em `supabase/functions/_shared/database.types.ts`, com reutilização pelo frontend.

No Cloud, os jobs antigos foram pausados e as tabelas de negócio receberam proteção de leitura para evitar duas bases ativas divergindo. Uma eventual volta ao Cloud exige sincronização atualizada, interrupção coordenada da VM, retirada da proteção e reativação controlada dos jobs; trocar apenas a URL não é um procedimento seguro de retorno.

O cliente autorizou excluir WORKOUT01, WORKOUT02 e WORKOUT03, preservando WORKOUT04. A documentação consultada para este resumo não comprova o estado atual dessas exclusões. Não afirmar que foram concluídas sem verificar.

A IA foi adaptada para Gemini direto com configuração como `GEMINI_API_KEY` e `GEMINI_MODEL`; há compatibilidade legada com `LOVABLE_API_KEY`. A validação real completa de geração/qualidade do Gemini permanece sem evidência conclusiva. Testes com provedor simulado não comprovam geração real.

## 6. WhatsApp, fila e avaliações transacionais

Foram corrigidos problemas de estabilidade da integração, estado de conexão e autenticação. A interface diferencia indisponibilidade, falha persistente de autenticação e estado desconhecido, evitando apresentar uma conexão como saudável sem evidência.

A criação de recorrências foi corrigida para materializar as ocorrências uma vez, com deduplicação. O exemplo inicial mais quatro repetições deve produzir cinco ocorrências, sem expansão recursiva para 17. Cancelamentos preservam histórico e tratam a série.

O worker usa uma concessão de execução exclusiva, lotes pequenos, orçamento de tempo, timeouts e pausa quando a conexão está indisponível. Antes de enviar, revalida condições relevantes: aluno ativo, automação, validade temporal, avaliação e vencimento.

Foi definida uma fronteira de despacho com `dispatch_started_at`. Depois de começar a chamada ao provedor, não se promete cancelamento do envio. Respostas ambíguas — erro de rede após despacho, falha do servidor ou sucesso sem identificador válido — podem ser marcadas como incertas, sem repetição automática que gere duplicidade.

A confirmação de envio na fila e o registro no histórico foram tratados de forma atômica. Se o provedor aceitou a mensagem e a gravação posterior falha, o estado precisa de reconciliação; não se deve reenviar automaticamente.

As operações de criar, remarcar, cancelar, concluir e registrar ausência em avaliação foram centralizadas na transação `mutate_evaluation_tx`. Falha na criação de mensagens vinculadas desfaz a operação inteira. Concluir uma avaliação antiga não deve fazer a última avaliação do aluno retroceder.

O endpoint legado passou a resolver o aluno cadastrado pelo identificador, sem confiar em nome/telefone enviados pelo navegador. Os estados pendente, processando, cancelado e incerto têm tratamento próprio na interface.

“Enviada” significa aceita pelo provedor no contrato disponível. Não comprova entrega ao telefone nem leitura pelo destinatário.

## 7. Autenticação, autorização e confirmação da IA

Foram aplicados vínculos de profissional e regras de autorização no banco/servidor. Funções internas de worker e manutenção não ficam disponíveis a usuários anônimos ou autenticados comuns. Cadastro público e login anônimo foram desativados conforme a evidência de publicação.

As consultas da IA usam o contexto autenticado e RLS. Ações propostas são persistidas com autoria, argumentos, estado e validade. A confirmação usa um identificador de proposta e uma operação de tomada de execução no servidor, evitando executar novamente a mesma confirmação.

Conversas foram tornadas duráveis: a pergunta é persistida antes da geração, e a resposta é gravada no servidor antes de retornar ao navegador. Identificadores estáveis permitem recuperar gravações sem gerar outra resposta. Reutilizar um identificador com conteúdo diferente é recusado.

Foram corrigidos problemas de mudança de conversa durante uma resposta, remount desnecessário na adoção do primeiro identificador, resposta atrasada na conversa errada, cancelamento não persistido e exclusão durante ação em andamento. O contexto do modelo vem do banco, limitado às mensagens recentes; o histórico visível pode ser maior.

Cards têm estados duráveis, incluindo pendente, executando, concluído, falhou, cancelado e expirado. HTTP 200 não significa, por si só, que uma ação foi concluída. Propostas antigas sem vínculo suficiente podem manter apenas o texto; não se deve inventar reconstrução de confirmação.

## 8. Automações e consultas completas

Foi criada observabilidade em `automation_runs`: início, fim, estado, contadores e erro. Uma restrição impede duas execuções simultâneas. Uma segunda chamada pode retornar como ignorada em vez de executar novamente.

Um registro em execução não é encerrado automaticamente por tempo. O alerta após 20 minutos não prova que o processo morreu. Recuperar exige pausar a origem, confirmar o término do worker, reconciliar os efeitos e encerrar o registro específico. Não apagar o histórico para destravar.

Execuções com falha podem ter criado parte das mensagens. A repetição precisa respeitar deduplicação. Foram alinhados limites compartilhados de lembrete/cobrança e preservadas configurações existentes.

Testes isolados cobriram volume acima do limite REST, incluindo 1.005 aniversariantes, enfileiramento completo e repetição sem novas mensagens. A primeira execução diária natural registrada pelo mecanismo novo ainda não tem comprovação nos relatórios usados aqui. Como a data prevista já passou, o próximo passo é consultar os registros existentes; não disparar automação real manualmente apenas para preencher essa evidência.

Consultas antes limitadas foram migradas para paginação com páginas de 500, contagem exata e desempate por identificador. Falha em uma página não é tratada como lista completa nem como ausência de alunos. Alunos, modelos, mensagens, agenda, histórico e contadores receberam revisões.

Limites restantes: algumas telas ainda carregam tudo para filtrar localmente; paginação por offset não é uma fotografia transacional durante inserções concorrentes. Outras listagens da IA precisam de revisão individual dos limites e totais.

## 9. Dashboard, modelos e regras de avaliação

O dashboard passou a usar `get_workout_dashboard()`, uma consulta central no PostgreSQL com RLS, em vez de métricas montadas por listas REST possivelmente truncadas. A IA reutiliza o mesmo retrato para evitar respostas contraditórias.

Datas e contagens relevantes usam as fronteiras de Brasília. Foram explicitados população ativa, totais, amostras limitadas e regras de prazo/carência. Falhas e falta de permissão aparecem como indisponibilidade; não viram zero silenciosamente. Cache passou a considerar identidade, papel e dia, com invalidações e atualização.

Templates deixaram de depender de cache global indefinido. O backend usa contexto por requisição, erros não viram ausência persistente e edições afetam novos enfileiramentos. Mensagens já materializadas mantêm seu conteúdo. Placeholders foram compartilhados e limitados a propriedades próprias.

O histórico da IA passou a filtrar o aluno no banco antes de aplicar limites, com ordenação estável, escape de curingas, total e indicação de parcialidade.

A agenda foi alinhada a `days_overdue` da automação: padrão 90 somente quando a configuração está ausente, com validação explícita de configuração inválida. Foram corrigidas divergências com um valor fixo de 30 dias e com regras de alunos ativos, datas futuras e carência. Ligar/desligar a automação não deve mudar a situação clínica exibida.

## 10. Limpeza e arquitetura já implementadas

No commit `3a0b185`, a tela de alunos caiu de aproximadamente 782 para 299 linhas e a de automações de 656 para 149, com extração de consultas, ações, filtros, preferências e componentes. As reduções são indicadores da reorganização, não uma meta isolada de qualidade.

Foram separados módulos de contexto e hooks de autenticação, tema, sidebar e confirmação. Avisos de React Refresh foram resolvidos pela organização dos módulos, sem desligar a regra.

Foram corrigidos, entre outros:

- Erro ao consultar alunos apresentado como lista vazia.
- Preferências de colunas inválidas ou JSON corrompido.
- Contagens pendentes incompletas e invalidações redundantes.
- Aniversários deslocados pelo uso de UTC.
- Selecionar todos comparando somente quantidades, mesmo com conjuntos diferentes.
- Perda de seleção ao mudar abas e identificadores inválidos vindos da URL.
- Tema inválido no armazenamento e acompanhamento da preferência do sistema.

O planejamento de mensagens foi compartilhado em `messageSchedule.ts`, os formulários reutilizam `useMessageComposerData` e regras de avaliação/fuso foram extraídas para `evaluationPolicy.ts` e `spTime.ts`. A validação de calendário, horário e tamanho personalizado ficou comum. Foram adicionadas travas síncronas nos compositores para cliques repetidos.

Ainda existe uma limitação importante: `strict`, `noImplicitAny`, `noUnusedLocals` e `noUnusedParameters` estão desativados em `tsconfig.app.json`; a regra ESLint de variáveis não usadas também está desativada. Lint zerado significa conformidade com a configuração atual, não tipagem estrita ou ausência comprovada de código morto. Endurecer isso gradualmente é trabalho restante.

## 11. Enfileiramento atômico e deduplicação por pedido

O commit `91ffc22` centralizou os pedidos em `enqueue_messages_tx(_request_id, _student_ids, _content, _schedule)`. O cliente envia intenção, alunos cadastrados e UUID do pedido; o servidor valida, personaliza e cria o lote inteiro em uma transação.

Há limites de alunos, quantidade total de ocorrências, texto após personalização e recorrência. Os modos agora, hoje/mais tarde, dias predefinidos e calendário personalizado usam regras comuns de Brasília.

`message_enqueue_requests` guarda autoria, pedido, conteúdo canônico e resultado, com trava concorrente. Mesmo pedido/conteúdo retorna o resultado anterior; mesmo UUID com conteúdo diferente é recusado. A repetição reconhecida não consome outra cota nem reaplica validações temporais que invalidariam uma recuperação legítima.

`messageQueue.ts` persiste UUID por identidade, escopo e hash do pedido no `sessionStorage`, sem guardar texto/PII nesse recibo. Falha/reload preserva a tentativa; sucesso limpa o recibo. Há fallback em memória se o armazenamento estiver bloqueado.

Compositores, boas-vindas, reativação, IA e endpoint legado passaram pelo fluxo. O INSERT direto em fila por usuários autenticados foi retirado depois da publicação do frontend compatível. O endpoint legado exige `request_id`; abas muito antigas precisam ser recarregadas.

Em homologação, 20 solicitações concorrentes idênticas produziram uma execução e 19 reaproveitamentos, cinco mensagens e uma cobrança de cota. Isso garante deduplicação do mesmo pedido no banco; não equivale a uma promessa de entrega externa exatamente uma vez.

Não remover o livro de pedidos indiscriminadamente: apagar recibos pode permitir que uma tentativa antiga seja executada outra vez.

## 12. Última entrega: conflitos de agenda e recuperação de rotas

O último código publicado é `24056d2b68a88278e3fe17ac2a9ef2530297d394`. A documentação posterior é o HEAD local `a92f387`.

Foi criada `evaluation_schedule_conflicts`, consulta única de leitura para frontend e IA. Ela encontra duplicidade do aluno e conflito mais próximo sem baixar uma lista potencialmente truncada. Aplica dia de Brasília, desempates determinísticos e janela aberta de 30 minutos; exatamente 30 minutos fica fora do conflito.

Na remarcação, só permite ignorar a avaliação que pertence ao aluno e ainda está agendada. A resposta é validada pelo parser compartilhado. A execução exige usuário autenticado com vínculo profissional; acesso anônimo é bloqueado. A função tem proprietário, `search_path` e timezone explícitos.

A consulta é uma prévia. `mutate_evaluation_tx` continua revalidando sob trava no salvamento, inclusive se surgir um conflito depois da consulta. A confirmação manual de conflito continua disponível. Migração: `20261014040000_evaluation_conflict_lookup.sql`.

Rotas carregadas sob demanda passaram a usar `lazyPage` e `RouteErrorBoundary`. Falha de importação/renderização apresenta recuperação com recarregamento escolhido pelo usuário e retorno ao início, sem detalhes internos. Trocar de rota limpa o erro. Não há reload automático que apague formulários ou crie ciclos.

Essa proteção não cobre falha do JavaScript inicial, indisponibilidade total do site, todo erro assíncrono ou uma aba que ainda executa a versão anterior.

## 13. Segurança de aplicação e CI

Foram sanitizadas respostas de erro de endpoints internos/Evolution. Rotas validam método, JSON objeto e tamanho efetivo do corpo, inclusive sem `Content-Length`. Contratos rejeitam calendário, UUIDs, argumentos, respostas do provedor e identificadores de mensagem inválidos. Logs de ferramentas não devem expor argumentos pessoais.

Cotas persistentes e atômicas por conta/operação foram implementadas no PostgreSQL. Valores documentados: assistente 20/10 minutos e 200/dia; briefing 10/100; rota legada de IA 60/1.000; envio 30/1.000. Limite retorna 429 com informação de nova tentativa. Indisponibilidade da cota bloqueia antes da operação. Cotas reduzem abuso, mas não são um teto financeiro exato do provedor.

O build bloqueia variáveis `VITE_*` privilegiadas/secretas. Foi criado scanner de padrões de credenciais e testes do scanner na CI. A revisão histórica documentou 1.290 blobs candidatos em 791 commits sem os padrões conhecidos; isso não prova ausência de toda senha possível, arquivo ignorado ou segredo fora do Git.

O último registro de npm audit e Deno audit estava sem achados nas respectivas dependências avaliadas. Isso não elimina as vulnerabilidades de imagens Docker. Credenciais de cron foram removidas de URLs e levadas para cabeçalhos.

A CI de Pages usa Node 22 e executa scanner, instalação travada, auditoria, tipos, lint, testes e build antes do deploy. Publicar o frontend não aplica automaticamente migrações nem funções na VM.

## 14. Segurança dos containers: avanços e dívida restante

A varredura Trivy original encontrou alertas em diversos componentes. Contagens são ocorrências de pacotes nas imagens, não número de ataques, CVEs únicos ou prova de exploração. Os resultados abaixo são os últimos documentados, sem nova consulta de advisories nesta consolidação.

| Componente | Resultado publicado/documentado | Pendência |
| --- | --- | --- |
| Evolution GO | Imagem `workout-evolution:0.7.2-security2`; críticos/altos zerados no scan do lote, preservando ativação e sessão | Um alerta médio em RabbitMQ com AMQP desativado e um aviso de situação desconhecida em módulo OpenPGP; acompanhar e corrigir antes de habilitar AMQP |
| Nginx | `workout-nginx:1.30.5-security1`; críticos/altos zerados | Reavaliar com inventário/advisories atuais e testar borda completa |
| Envoy | 1.39.4; altos zerados no lote | Restavam alertas médios/baixos |
| Storage | `workout-storage:1.74.0-security1`; passou de 1 crítico/72 altos para 0 críticos/41 altos | Corrigir dependências da aplicação em lote compatível |
| Outros serviços Supabase/infra | Inventariados, mas sem encerramento completo | Revisar Auth, Realtime, Studio, Meta, Supavisor, PostgREST, PostgreSQL, imgproxy, cloudflared e demais imagens conforme inventário atualizado |

A candidata oficial de Storage mais nova não foi publicada automaticamente: ainda apresentava alertas e introduzia migrações adicionais. A atualização publicada preservou os arquivos da aplicação e o histórico de migrações, atualizou o sistema base e removeu ferramentas de desenvolvimento dispensáveis.

Os 41 altos restantes do Storage envolvem, entre outros, Fastify/busboy, gRPC, propagador Jaeger, brace-expansion, fast-uri, ip-address, js-yaml, protobufjs e undici. Exigem análise de alcance e testes de compatibilidade, não substituições forçadas sem validação.

Homologação de gateways cobriu Auth, REST, Storage, Realtime/WebSocket e Edge. Storage teve 26 verificações, incluindo permissões de bucket privado, upload/download, cópia, movimentação, sobrescrita e URLs assinadas. TUS, S3, transformação de imagens e carga prolongada não foram cobertos nesse lote.

A licença da Evolution não ativou as rotas operacionais da instância isolada; o cliente não sabia se a licença permite segunda instância. A troca final preservou a ativação legítima existente. Isso limita a evidência da homologação operacional completa; não tentar contornar licenciamento.

## 15. Backups e operação

Existem backups de banco, papéis/configuração, runtime e arquivos, com cópias privadas fora do Git. O timer diário documentado é 06:00 UTC. A sincronização Windows depende de o computador estar disponível, na tarefa `Workout Supabase Backup Sync`.

O último backup do lote publicado é `20261014T134537Z`: quatro arquivos, integridade no servidor e cópia local conferida por SHA256. Release: `/opt/workout-releases/20261014-agenda-recovery`. Foram conferidos 26 hashes de runtime, função SQL, permissões e retomada das flags originais dos dois jobs.

Um backup legível, catálogo de `pg_restore` e hashes corretos não comprovam restauração completa. Ainda falta restaurar em ambiente isolado e verificar banco, Auth, arquivos, funções e comportamento integrado.

SMTP não está configurado conforme o relatório de migração. Recuperação por email depende dessa configuração e validação.

Os jobs documentados são o worker por minuto e a automação diária às 08:00 de Brasília. Não usar sucesso do cron como prova de entrega de mensagens. Contagens de alunos, usuários e mensagens presentes em relatórios anteriores são fotografias históricas, não números atuais.

Referências locais para operador autorizado, sem conteúdo secreto:

- VM: `ubuntu@157.151.12.122`; raiz `/opt/workout-supabase`.
- Chave SSH privada: `C:\Users\pejon\.codex\ssh-workout04\oracle-workout.key`.
- Known hosts fixado: `C:\Users\pejon\.codex\backups\workout04-20261011\oracle-known-hosts`.
- Backups locais privados: `C:\Users\pejon\.codex\ssh-workout04\backups`.
- Backups na VM: `/home/ubuntu/workout-backups`.
- Homologação: `/opt/workout-stage-security-20261012`, gateway interno `127.0.0.1:18090`.

Esses caminhos pertencem ao ambiente local original; outra máquina pode não tê-los. Não imprimir `.env`, chaves, dumps ou inspeções de container. Inspeções privadas podem conter credenciais. Não executar `reset.sh`, remoção de volumes ou `down -v` para atualizar serviços.

Procedimentos de release pausam jobs, drenam processamento e lease, verificam backup, aplicam SQL antes dos consumidores quando necessário, validam handlers e restauram gateway/jobs. Scripts antigos podem ter caminhos e identificadores fixos; adaptar para nova release, não repetir um script anterior cegamente.

O retorno do último lote restaura runtime/gateway/flags anteriores. A consulta SQL adicional pode permanecer sem uso. O frontend anterior ao último código é `d084e04`. Retorno de código não exige restaurar banco automaticamente.

## 16. Ponto exato de parada e validação disponível

### Atualização de continuidade local (14/10/2026)

Foi executada uma validação local após a retomada do handoff. Evidências novas:

- README e runbook permanecem como documentação atualizada no workspace.
- Agenda/conflitos permanecem com a validação histórica registrada; a suíte local atual confirmou 274 testes em 32 arquivos.
- `npm audit --omit=dev` gerou `docs/audit-current-prod.json` com zero vulnerabilidades reportadas nas dependências de produção avaliadas.
- Scanner local de segredos: 373 arquivos analisados, 0 achados.
- Testes do scanner: 5 testes aprovados.
- Lint, tipos, testes e build foram executados novamente nesta retomada e passaram.

Estes resultados são evidências do workspace local. Eles não substituem inspeção atual da VM, restore isolado, rotação de credenciais ou testes reais controlados de serviços externos.

| Item | Última evidência |
| --- | --- |
| HEAD local | `a92f387` — documentação da entrega da agenda |
| Último código publicado | `24056d2b68a88278e3fe17ac2a9ef2530297d394` |
| Workflow | https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38574717758 — sucesso registrado |
| Testes | 274 em 32 arquivos |
| Lint | Zero erros e zero avisos |
| Tipos/build | Aprovados |
| Deno | Check do consumidor da IA e HTTP com dois testes principais/14 passos aprovados |
| Scanner de segredos | 367 arquivos sem padrões detectados no último bloco |
| Produção | 26 hashes, SQL, permissões e jobs conferidos |
| Navegador | Dashboard e Agenda abriram após o pipeline; controles/dados carregaram |
| Operações reais nesse bloco | Nenhuma avaliação criada/remarcada/concluída, nenhum WhatsApp enviado e nenhuma chamada paga de IA |

Não houve nova validação operacional para redigir este documento. Se outro chat retomar depois, deve verificar divergências locais e de produção antes de assumir que essa fotografia permanece atual.

## 17. Tabela consolidada dos seis itens da auditoria

| Item original | Situação real | O que falta |
| --- | --- | --- |
| 1. Limpeza e qualidade profissional | Parcialmente concluído e publicado | Agenda, outras telas grandes, código morto e endurecimento gradual de tipos |
| 2. Corrigir 142 erros + 19 avisos de lint | Concluído na última validação | Manter zero; revisar regras atualmente desativadas em lotes próprios |
| 3. Segurança final | Várias correções publicadas; encerramento pendente | Containers restantes, Storage, rotação comprovada, borda/recuperação e consolidação |
| 4. Arquitetura frontend | Parcialmente concluído e publicado | Extrair agenda e revisar cache/consultas remanescentes |
| 5. Performance: bundle acima de 1 MB | Melhorado com carregamento de rotas sob demanda | Medir build atual, maiores chunks, rede/dispositivo e consultas em escala |
| 6. Documentação e deploy | CI, scripts, AGENTS e evidências existentes | README real, runbook consolidado, restore e documentação de operação final |

No lote de divisão por rotas, o bundle principal caiu de aproximadamente 1.060,33 kB/305,88 kB gzip para 423,44 kB/121,24 kB gzip. Essa é uma comparação histórica daquele lote, não uma nova medição nem prova de tempo de carregamento em celular.

## 18. Pendências técnicas em ordem sugerida

1. **Concluir a revisão da agenda.** Separar `AgendarAvaliacao.tsx` em hook e componentes com responsabilidades claras; preservar os contratos existentes. Ainda reúne consultas, filtros, estatísticas, mutações, dialogs e renderização.
2. **Normalizar datas exibidas.** A consulta de conflitos já usa Brasília; ainda revisar agrupamentos, rótulos, “hoje”, “amanhã”, atrasos e histórico para navegador em outro fuso. Existem usos de `date-fns` dependentes do fuso local que precisam de análise contextual.
3. **Persistir tentativa de criar avaliação.** O fluxo de mensagens já tem recibo por pedido; a criação de avaliação ainda precisa tratar perda de resposta/reload sem gerar novo identificador e duplicar a intenção. Analisar a idempotência existente em `mutate_evaluation_tx`, prévia de duplicidade e mensagens vinculadas antes de alterar. Não presumir que repetir com UUID novo é seguro.
4. **Revisar travas de formulário e cache.** Checar cliques repetidos, resposta atrasada, troca de identidade, invalidação e erros parciais na agenda e telas remanescentes. Reutilizar helpers atuais em vez de abrir uma camada paralela.
5. **Atualizar inventário de segurança da VM.** Priorizar risco e exposição atuais; atacar Storage e outros serviços sem perder compatibilidade, dados e ativação. Registrar scan antes/depois por imagem imutável e limites da análise.
6. **Fechar evidências operacionais.** Consultar a primeira execução diária natural, acompanhar falhas novas versus antigas e validar estabilidade. Não repetir mensagens antigas falhas sem reconciliar o que aconteceu no provedor.
7. **Executar recuperação completa isolada.** Provar restauração e medir tempo; documentar RPO/RTO e dependências externas. Depois avaliar política de retenção e independência das cópias.
8. **Fechar credenciais e recuperação de acesso.** Confirmar rotação das credenciais compartilhadas no histórico e configurar SMTP se a recuperação por email for necessária, com atualização coordenada de dependentes.
9. **Validar IA real quando houver condições.** Testar credencial/modelo, geração, timeout e qualidade com chamada controlada. Os testes atuais com mocks não encerram esse ponto. Não executar chamadas pagas como teste automatizado.
10. **Melhorar qualidade estática gradualmente.** Ativar verificações de código não usado e tipagem estrita por escopo, corrigindo causas. Evitar desligar regras para declarar a auditoria concluída.
11. **Medir performance atual.** Analisar chunks e carregamento real, reduzir consultas/all-pages quando necessário e preservar indicação de totais/parcialidade.
12. **Consolidar documentação e fechar a matriz de auditoria.** README, configuração pública/privada, instalação, deploy frontend/backend, backup, restore, rollback, observabilidade e limitações conhecidas.

Os itens de recuperação e vulnerabilidades operacionais têm risco próprio e podem exigir prioridade antes de um refactor puramente organizacional. A ordem da próxima execução deve considerar novas evidências de produção.

## 19. Melhorias de produto propostas, ainda sem conclusão comprovada

Estas sugestões não devem ser confundidas com bugs já corrigidos ou entregas prometidas para o próximo lote:

- Painel de trabalho diário com pendências acionáveis e responsáveis conforme a operação atual.
- Linha do tempo unificada do aluno, arquivamento bem definido e importação CSV com prévia/validação.
- Campanhas com estados claros, preferências de contato, opt-out, janelas de silêncio e limite global de frequência por aluno.
- Recepção de eventos/respostas do WhatsApp e interrupção de sequências quando o aluno responde.
- Avaliação física estruturada: medidas, protocolos, evolução, resultados e anexos. A agenda/comparecimento/notas não equivale a um prontuário completo de avaliações.
- Financeiro com cobranças, histórico, valores, pagamentos, estornos e planos. Um campo de vencimento não constitui módulo financeiro completo.
- Métricas de resultado: retorno, agendamento e conversão, além de quantidade enviada.

Não há justificativa registrada para reescrever tudo, criar microserviços ou introduzir multitenancy neste momento.

## 20. Histórico Git de referência

| Commit | Entrega |
| --- | --- |
| `a4acee5` | Backend na VM Oracle e Gemini direto |
| `2b2a889` | Evidências da migração e recuperação |
| `fe02bcf` | Acesso protegido e confirmação da IA executada uma vez |
| `c62f87c` | Histórico de automações, paginação e rotas sob demanda |
| `6ec1d45` | Contratos IA/avaliações e correções de lint |
| `a355154` | Dashboard com RLS e modelos por requisição |
| `7c325ec` | Persistência segura de conversas e confirmações |
| `419401c` | IA alinhada ao dashboard autoritativo |
| `f3444a2` | Filtro correto e parcialidade do histórico de mensagens |
| `e7e230b` | Prazo da agenda alinhado às configurações |
| `716b525` | Cron autenticado e erros sanitizados |
| `ed63c61`, `16bdcec` | Atualizações Evolution preservando ativação/sessão |
| `2988943` | Nginx/Envoy atualizados após homologação |
| `bcdb84b` | Storage endurecido sem migrações adicionais |
| `3a0b185` | Refactor de telas e módulos React |
| `95c5109` | Cotas persistentes e publicação de segurança |
| `f6afc15` | Regras compartilhadas de agendamento |
| `91ffc22` | Enfileiramento transacional com recibo por pedido |
| `24056d2` | Conflitos de avaliação centralizados e recuperação de rotas |
| `a92f387` | Registro da publicação e navegador do último lote |

## 21. Fontes para aprofundamento

Arquivos em `docs/auditoria-2026-10-11/`, salvo indicação:

- `docs/auditoria-2026-10-11.md`: diagnóstico inicial, histórico.
- `docs/supabase-na-vm-2026-10-11.md`: migração, diferenças e recuperação; fica diretamente em `docs/`.
- `docs/estabilizacao-envios-2026-10-11.md`: fila, envio e avaliações; fica diretamente em `docs/`.
- `revisao-automacoes-2026-10-13.md`, `revisao-paginacao-2026-10-13.md`.
- `revisao-contratos-2026-10-13.md`, `revisao-dashboard-2026-10-13.md`.
- Relatórios `revisao-conversas`, `revisao-ia-dashboard`, `revisao-ia-historico` e `revisao-prazo-agenda` de 13/10.
- `limpeza-codigo-2026-10-13.md`: refactors; publicação posterior registrada no Git.
- `inventario-runtime-2026-10-13.md`, `varredura-runtime-2026-10-13.md`.
- `evolution-seguranca2-2026-10-13.md`, `gateways-seguranca-2026-10-13.md`, `storage-seguranca-2026-10-13.md`.
- `seguranca-2026-10-14.md`, `publicacao-2026-10-14.md`.
- `arquitetura-agendamentos-2026-10-14.md`, `enfileiramento-atomico-2026-10-14.md`.
- `agenda-recuperacao-2026-10-14.md`: fonte mais recente do ponto de parada.

Relatórios de preparação local podem ter sido superados por uma publicação posterior. Conferir o commit e a seção final de publicação antes de concluir que algo ficou só local.

## 22. Estado local e comandos para a próxima conversa

Antes de criar este documento, não havia modificações em arquivos rastreados. Há vários relatórios e scripts preexistentes não rastreados. Eles não devem ser removidos nem incluídos em um commit genérico. Um clone do GitHub não traz esses arquivos automaticamente.

Entre os não rastreados estão o diagnóstico inicial, relatórios `publicacao-*` de 13/10, a conferência operacional, SQLs de verificação e scripts de staging em `ops/supabase-self-hosted/`. Este handoff foi criado localmente; sua criação não significa commit, push ou deploy.

Comandos usuais, usando Node 22 e npm:

```text
npm ci
npm run dev
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
npm run audit:security
python -m unittest discover -s ops -p test_repository_secrets.py
python ops/check-repository-secrets.py
```

Seguir `supabase/tests/README.md` para HTTP/Deno. Escolher testes relacionados à mudança e os checks exigidos. Não repetir uma suíte inteira em ciclos sem nova alteração ou dúvida. Para inspeção inicial, usar `git status`, `git log` e relatórios; não substituir dados locais por reset.

### Texto pronto para iniciar a outra conversa

> Continue a auditoria do Workout a partir de `docs/HANDOFF-AUDITORIA-2026-10-14.md`. Leia o `AGENTS.md`, confira Git e evidências antes de alterar. O último código publicado é `24056d2`, com documentação em `a92f387`: conflitos de agenda centralizados e recuperação de rotas. A última validação registrada tem 274 testes/32 arquivos, lint zero, tipos e build aprovados. A tabela de 142 erros/19 avisos é histórica. Limpeza e arquitetura já foram parcialmente publicadas. O próximo bloco proposto é concluir a agenda: extração de responsabilidades, datas de Brasília em todas as exibições, persistência de tentativas de criação após falha de rede e revisão de cache/travas. Há dívida de segurança nos containers, incluindo 41 alertas altos documentados no Storage, além de restore completo, execução diária natural e IA real ainda sem fechamento. Preserve o login compartilhado pedido pelo cliente, as migrações e dados, e os arquivos locais não rastreados. Trabalhe em blocos substanciais sem microconfirmações. Não faça envios reais/IA paga em testes automatizados. Para produção, exija backup verificado e procedimento de retorno. Diferencie o que implementou, validou e publicou, e não declare a auditoria inteira concluída sem evidência.
