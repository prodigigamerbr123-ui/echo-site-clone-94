# Workout — handoff e pendências consolidadas

Atualização: 27/10/2026 (seção mais recente logo abaixo; o restante é histórico de 18/10). Este é o ponto de entrada para continuar a auditoria. Contém os 63 itens da tabela consolidada da conversa, incluindo implementação, publicação, infraestrutura, documentação e propostas de produto.

## Automações e configurações — 27/10/2026 (publicado)

- **Backend:** `ops/supabase-self-hosted/release-overdue-dismiss.py`, estado em `/opt/workout-releases/20261027-overdue-dismiss`. Backup `20261027T020339Z`, cinco arquivos verificados e copiados para `C:/Users/pejon/.codex/ssh-workout04/backups/20261027T020339Z` com SHA256 iguais. Migração `20261027010000_dismiss_reviewed_failures` (ensaiada com ROLLBACK antes). Edge: `_shared/paymentOverdue.ts`, `_shared/database.types.ts`, `daily-automation/index.ts`; smoke 401 em seis funções, incluindo `daily-automation`. Contagens preservadas; cron reativado.
- **Cobrança de vencido:** para após `max_attempts` por vencimento (padrão 3; conta pending/processing/sent/uncertain com o mesmo `source_payment_due_date`). Acima de 30 dias o texto diz "mais de 30 dias".
- **Falhas:** `dismiss_failed_messages_tx` (admin/recepção) marca falhas sem `dispatch_started_at` como canceladas, prefixando o motivo com "Falha revisada:". Botão "Marcar como revisadas" na aba Falhas. As 35 falhas antigas continuam aguardando a baixa pelo dono.
- **Configurações:** removido o grupo Sistema (três interruptores sem efeito). **Reengajamento:** descrição corrigida (uma mensagem X dias após inativar) e padrão único de 30 dias.

## Publicado em produção — 27/10/2026

O lote de 18/10 e as correções da revisão de design de 26/10 **estão em produção**. A seção "Lote local de produto" abaixo é histórica: não reaplicar as migrações.

- **Backend (VM):** script `ops/supabase-self-hosted/release-student-batch.py` (prepare/apply/resume), estado em `/opt/workout-releases/20261026-student-batch`. Ensaio das seis migrações em transação desfeita antes da aplicação. Aplicadas numa única transação e registradas em `schema_migrations`: `20261015210000`, `20261018210000`, `20261018220000`, `20261018230000`, `20261019000000`, `20261026000000`. Contagens preservadas (3 alunos, 2 avaliações, 62 mensagens).
- **Edge:** `_shared/aiDashboard.ts`, `_shared/contactPreference.ts`, `_shared/database.types.ts`, `_shared/evaluationPolicy.ts`, `daily-automation/index.ts`, `send-oneshot/index.ts`; hashes conferidos com o manifesto e smoke 401 sem autenticação nas cinco funções verificadas. A divergência anterior da VM em `daily-automation` (só CRLF) e `database.types.ts` (só tipo) foi sobrescrita.
- **Backup:** `20261027T013019Z`, cinco arquivos verificados na VM e copiados para `C:/Users/pejon/.codex/ssh-workout04/backups/20261027T013019Z` com SHA256 iguais. A cópia foi feita por SSH, não por `sync-backup.ps1`, então `last-sync.txt` não foi atualizado por esta execução. Retorno do schema = restaurar esse backup; o `rollback` do script só repõe as funções e a operação.
- **Janela:** gateway público em 503 e os dois cron jobs pausados durante prepare/apply; ambos reativados no resume.
- **Frontend:** `main` em `9acc4c7` (workflows de `62fac8f`, `fb9f7e1` e `9acc4c7` aprovados). `zod` atualizado para 4.6.7 por GHSA-mrhx-c7xc-m3w5 (alto, publicado após 15/10; o pacote não é importado). Telas Início, Alunos, Agenda e Mensagens conferidas em produção após recarregar.
- **Revisão de design 26/10, agora publicada:** banner só acusa WhatsApp desconectado com estado `close`; "Nunca avaliados" conta só ativos no painel e na lista; Início com três ações coloridas, pendências clicáveis e números coloridos clicáveis abertos direto (sem `details`); inativos sem selo de prazo e fora dos destinatários por padrão; menu com Início/Alunos primeiro e status do WhatsApp no item; margem de 16px no celular.
- **Recarga após deploy:** abas abertas pediam chunks do build anterior (404, tela "Não foi possível abrir esta tela"). A partir do commit seguinte, a tela recarrega sozinha uma vez quando o `index.html` publicado aponta para outro build; sem build novo confirmado, mantém o botão manual.

Pendências: produção mostra 35 falhas de mensagem históricas para o dono conferir na Caixa de saída; textos confusos do parecer ("Fila de Vencidos", "PREVIEW", "Placeholders", "Enfileirar envio", título duplicado em Alunos); fallback de reengajamento 20 × 30 dias; destino externo de backup; tema escuro e teclado ainda sem conferência completa nas demais telas.

## Lote local de produto — 18/10/2026

O trabalho atual é a lógica de cadastro, matrícula, renovação e ficha do aluno. As evidências de produção abaixo continuam históricas de 15/10; o lote descrito aqui está **implementado localmente, sem commit, push ou publicação**. Não tratar os arquivos locais como se já estivessem na VM ou no site público.

**Aprovação e etapa atual:** o cliente pediu continuidade após as buscas. A etapa atual corrige **filtros de data da Caixa de saída**: enviadas/programadas usam os mesmos limites de Brasília, Hoje/Este mês têm início e fim, dia único personalizado não vira intervalo aberto e o histórico exibe fuso explícito. Filtros recalculam na virada do dia para os dados carregados; Atualizar histórico busca registros recentes. Prévia com exemplos fictícios de hoje/ontem: `http://127.0.0.1:18091/.workout-preview.local/index.html#/caixa-de-saida?aba=enviadas`. **510 testes/75 arquivos, lint, tipos, build e alcance aprovados com Node 22.23.3.** Ver `docs/PERIODOS-MENSAGENS-2026-10-18.md`. Sem migração nova; as cinco anteriores continuam locais. Sem commit/push/publicação.

- Cadastro/matrícula e renovação recebidos do bloco anterior foram preservados: início na academia, benefício, avaliação anterior informada sem inventar atendimento, revisão/duplicidades e ação de renovação com datas de calendário. Migrações locais: `20261015210000_student_admission.sql` e `20261018210000_cancel_outdated_payment_reminders.sql`; a segunda cancela lembretes antigos ainda não despachados quando muda o vencimento. Não foram aplicadas em produção neste bloco.
- Ficha e edição agora confirmam a inativação, impedem submissões repetidas e informam falha ao programar reengajamento mesmo quando a alteração do aluno foi salva. A ficha esclarece que histórico e agendamentos são preservados; avaliação futura exige decisão explícita na agenda.
- A mudança rápida de status exige o mesmo status lido originalmente e verifica a linha retornada. A edição verifica todos os campos editáveis originais, inclusive valores nulos, antes de atualizar; uma renovação ou edição concorrente deixa de ser sobrescrita silenciosamente. Isso não é um histórico de versões nem resolve indisponibilidade após uma resposta de rede perdida.
- Lista, filtros e atalhos usam chaves estáveis de prazo (`overdue`, `due_soon`, `upcoming`), com “Prazo vencido”, “Vence hoje” e “Vencimento futuro”. Uma data futura não é apresentada como pagamento confirmado. Preferência de coluna mantém a chave `payment` para compatibilidade.
- Ficha como ponto de atendimento: ações no início (editar, renovar, agenda e preparar mensagem), situação do prazo e compromisso em aberto mais antigo. Avaliações atrasadas aparecem como “aguardando baixa”; falha de consulta não é apresentada como ausência de agendamento. Editar/renovar retorna à mesma ficha, que consulta o registro atualizado; falha na atualização bloqueia alterações. A ficha aberta após cadastro também oferece essas ações. A prévia local usa os componentes reais com adaptador em memória em `.workout-preview.local/` (ignorado pelo Git), na porta 18091.
- Verificação deste lote ampliado: 385 testes em 53 arquivos com Node 22.23.3, incluindo retorno à ficha após edição/renovação, preservação do aluno na navegação, agendamento atrasado, falha de consulta e limite por perfil; lint, tipos, build e alcance também verificados. Auditoria npm do bloco anterior retornou zero vulnerabilidades; dependências não mudaram. Detalhes e limites em `docs/ALUNOS-FLUXOS-2026-10-18.md`.

Próxima retomada: colher a revisão do conjunto de fluxos (incluindo buscas e conferência de entregas) com o cliente; preparar homologação e publicação conjunta das cinco migrações locais (cadastro, lembretes por vencimento, histórico de plano, preferência de contato e data real), funções diária/diagnóstico, textos e frontend, com backup verificado e retorno. Não publicar sem mostrar e combinar com o cliente. Motivo/data de inativação, correção de avaliação já encerrada e evento de automação transacional continuam propostas. No reengajamento, o fallback do helper ainda é 20 dias e o catálogo exibe 30 quando não há parâmetro: alinhar a regra antes de evoluir essa automação. Preservar arquivos independentes dos outros chats.

Índice das entregas mais recentes: [evidências](docs/auditoria-2026-10-11/README.md). O histórico detalhado, decisões, arquitetura, commits e procedimentos estão em [HANDOFF-AUDITORIA-2026-10-14.md](docs/HANDOFF-AUDITORIA-2026-10-14.md). As evidências do último bloco estão em [fechamento-basico-2026-10-15.md](docs/auditoria-2026-10-11/fechamento-basico-2026-10-15.md). Em caso de divergência, distinguir data, código local, validação e versão publicada.

## Estado atual e regras de continuidade

> Rodada básica de 15/10: frontend fa56487 publicado, workflow 38797495844 aprovado; 349 testes/47 arquivos, lint sem avisos, tipos/alcance/build e assets de entrada/CSS/caixa de saída conferidos. Corrigidos erros/rascunhos/travas da caixa de saída e altura/rolagem dos diálogos. Cinco runtimes publicados: dois bancos com zero críticos/altos, Edge/Realtime com bibliotecas atualizadas e Cloudflared sem críticos/altos. Imgproxy desligado por padrão, como Studio/Meta. Monitor local de cinco minutos com 27 checks aprovados. Backup final 20261015T195613Z copiado/hashes conferidos, núcleo repetiu 39 checks e três bancos Evolution foram restaurados/reiniciados em isolamento. Ver [fechamento básico](docs/auditoria-2026-10-11/fechamento-basico-2026-10-15.md). Sem bug bloqueante identificado nos fluxos verificados; isso não é garantia de ausência absoluta de defeitos. Riscos residuais, credenciais técnicas fora deste lote, destino externo e observação futura permanecem explícitos. Próxima etapa solicitada: discutir layout, sem iniciar redesenho sem combinar as propostas.


> Mensagens predefinidas: correções publicadas e verificadas em 15/10, 342 testes/44 arquivos e nove verificações HTTP isoladas. Backup 20261015T191602Z copiado/hashes conferidos. Commit f13ae5b, workflow 38792640691 aprovado; entrada e rota coincidem com o build local por SHA256. Ver [relatório](docs/auditoria-2026-10-11/templates-basico-2026-10-15.md).


> Studio/Meta sob demanda em 15/10: perfil admin, restart no, ambos desligados; gateway agora depende do banco. Dez verificações isoladas com os dois serviços ausentes e 20 em produção, repetidas; dados/senhas preservados, rotas externas e WebSocket conferidos. Backup pós 20261015T184842Z copiado/hashes conferidos e compose validado dentro do arquivo. As imagens antigas não foram corrigidas e outros containers continuam com pendências. Ver [relatório](docs/auditoria-2026-10-11/admin-sob-demanda-2026-10-15.md).

> Senha do proprietário alterada em 15/10 após autorização explícita. Login e dashboard com a nova senha aprovados; sete sessões antigas removidas, zero sessões/refresh não revogados ao final, testes de refresh recusados. Dados preservados. Senha somente no arquivo privado C:/Users/pejon/.codex/ssh-workout04/owner-password-20261015/senha.txt; plano marcado aplicado. Backup pós 20261015T190428Z copiado/hashes conferidos. Access tokens já emitidos expiram no prazo próprio (token verificado: 1h); demais credenciais não foram rotacionadas. Ver [relatório](docs/auditoria-2026-10-11/senha-proprietario-2026-10-15.md).

> Continuidade básica publicada em 15/10: configurações cc2eaa6, workflow 38778303244 aprovado; 328 testes/41 arquivos e assets conferidos. Falha de carregamento, cliques duplicados e disputa de salvamento no mesmo cliente corrigidos. Backup instalado ampliado com Evolution dentro de runtime.tar.gz; snapshot 20261015T174108Z copiado/hashes conferidos, três bancos/configuração restaurados em isolamento e núcleo Workout repetido com 39 checks. Provedor não iniciado no teste; produção continuou conectada. Ver [configurações](docs/auditoria-2026-10-11/configuracoes-basico-2026-10-15.md) e [backup Evolution](docs/auditoria-2026-10-11/backup-evolution-2026-10-15.md).

> Escopo ajustado pelo cliente em 15/10: uso interno de uma academia pequena, com o básico bem feito. Seguir [escopo de encerramento](docs/ESCOPO-ACADEMIA-PEQUENA.md). A tabela histórica não significa 63 requisitos para liberar uso. Priorizar proteção do acesso, dados/backup, alunos/agenda, mensagens e erros claros. Melhorias de produto, refatorações sem defeito concreto e testes de escala elevada ficam para evolução; não apagar riscos ou declarar verificações não executadas.

> Borda e operação conferidas em 15/10: TLS válido, rotas administrativas bloqueadas, anon sem acesso aos alunos, preflight/CORS preservados. HSTS, nosniff e no-referrer publicados por reload, sem recriar container. Backup pós `20261015T171145Z` copiado/hashes conferidos. Segundo ciclo diário natural bem-sucedido às 08h, sem candidatos/envios. Ver [relatório](docs/auditoria-2026-10-11/borda-operacao-2026-10-15.md).

> Lote de qualidade de 15/10 publicado em b981426 (workflow 38774544059 aprovado), validado localmente e em homologação: 322 testes/39 arquivos, TypeScript estrito, lint e alcance de módulos aprovados, zero vulnerabilidades npm reportadas. Removidos 17 módulos desconectados; formulário, lista, fila e diálogo da agenda separados. Bug de pré-seleção após refetch corrigido. Entrada e agenda servidas em produção coincidem com o build validado; conferir [relatório](docs/auditoria-2026-10-11/qualidade-frontend-2026-10-15.md). Cliente dispensou SMTP e informou não possuir destino externo de backup.

> Recuperação integrada comprovada em 15/10: snapshot `20261015T162649Z`, 39 checks, banco principal + `_supabase`, Auth, REST, arquivos e funções em rede isolada; reinício e cleanup aprovados. Medição de 20,42 s com imagens prontas e poucos registros, sem representar RTO completo. Lacuna do cache Deno corrigida no backup; 34 arquivos de funções e 222 de cache restaurados. Storage/Nginx/Evolution também tiveram imagens copiadas e blobs OCI conferidos fora da VM. Host vazio, serviços externos e cópia externa independente continuam pendentes. Ver [recuperação integrada](docs/auditoria-2026-10-11/recuperacao-integrada-2026-10-15.md).

> Auth security1 publicado em 15/10: imagem `94a79d1a5e15…`, 42 verificações isoladas e 19 em produção repetidas após reinício. Senhas, identidades, migrações e sete sessões anteriores preservadas; sessão própria da auditoria encerrada. Trivy com base atualizada: 30 altos → um alto residual da versão pgproto3, com correção local documentada, cinco baixos/um desconhecido; sem supressão. Backups pré/pós e imagem/evidência copiados/hashes conferidos. Ver [Auth e backups](docs/auditoria-2026-10-11/auth-seguranca-2026-10-15.md).

> Backup automático ampliado confirmado em 15/10 às 06:03:45 UTC (03:03:45 de Brasília), snapshot `20261015T060345Z`: cinco arquivos copiados para fora da VM e SHA256 conferidos; ambos os catálogos e configurações obrigatórias validados. O procedimento e a sincronização instalada agora também conferem SHA256 automaticamente; execução manual `20261015T161530Z` aprovada. O núcleo integrado foi restaurado posteriormente; armazenamento externo independente continua pendente.

> PostgREST publicado: `workout-postgrest:14.17-security1`, imagem `dc990d07c8ce…`, com **zero críticos/altos**, 37 médios e quatro baixos. Mesmo binário 14.17; runtime sem compiladores/cabeçalhos, sem root, read-only e sem capabilities. **41 checks isolados e 17 em produção**, repetidos após reinício. Backups pré/pós e imagem copiados/conferidos fora da VM; schemas e funções preservados. Ver [entrega PostgREST](docs/auditoria-2026-10-11/postgrest-seguranca-2026-10-14.md).

> Permissões do pooler publicadas: duas contas técnicas próprias, sem privilégios administrativos e sem a senha administrativa compartilhada no ambiente. Migrações separadas da execução; helper de autenticação recusa contas privilegiadas. **56 checks isolados e 29 em produção**, repetidos após reinício. Backups pré/pós copiados e conferidos; metadados da nova configuração restaurados isoladamente. Ver [credenciais e permissões](docs/auditoria-2026-10-11/pooler-permissoes-2026-10-14.md).

> Pooler publicado: `workout-supavisor:2.9.12-security1`, imagem `1f3562efb570…`, saudável, com nove bibliotecas corrigidas + Finch, execução sem root, rootfs somente para leitura e sem capabilities. **32 verificações isoladas e 12 pós-publicação passaram**. Zero críticos e 48 ocorrências altas (10 CVEs revisados); seis registros Hex residuais continuam abertos. Backup ampliado para cinco arquivos, restore dos metadados comprovado e imagem copiada para fora da VM. Ver [publicação e riscos restantes](docs/auditoria-2026-10-11/pooler-publicacao-2026-10-14.md).

> Segurança da VM atualizada: nova varredura das 15 imagens/16 containers e publicação do Storage security2, imagem `8117cb0357a0…`, com zero críticos/altos e 25 médios. Passaram 31 verificações isoladas; backup `20261014T182248Z` e seis arquivos privados conferidos. Naquela entrega, somente Storage foi recriado; dados e migrações preservados. Ver [varredura](docs/auditoria-2026-10-11/runtime-seguranca-2026-10-14.md) e [entrega Storage](docs/auditoria-2026-10-11/storage-seguranca-2026-10-14.md). Outros containers continuam com achados; o pooler foi atualizado posteriormente conforme o relatório acima. Esta atualização de infraestrutura não mudou o frontend.

> Entrega publicada: `892bb88b5456e3ae92b26743b5fce1dfb8c2a49b`, [workflow 38611036898](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38611036898) concluído com sucesso. Homologação integrada de criação, remarcação, histórico e edição/conflito de notas; 306 testes em 36 arquivos. Backup `20261014T175538Z`, quatro arquivos copiados e hashes conferidos. Dashboard, agenda e histórico conferidos em produção sem escrita. Ver [relatório da entrega](docs/auditoria-2026-10-11/agenda-publicacao-2026-10-14.md). Execução diária natural também confirmada no item 35.

- Última rodada publicada: confiabilidade da caixa de saída/histórico, diálogos em tela baixa, cinco runtimes, imgproxy opcional e monitor operacional. Frontend fa56487; infraestrutura/documentação a28fccb. Limites e riscos no relatório de fechamento. As entregas anteriores de tipos, limpeza, agenda e recuperação permanecem preservadas.
- Validação atual: **349 testes em 47 arquivos; lint, tipos estritos, alcance e build aprovados**; CI de fa56487 aprovado; scanner do repositório e evidências deste lote no relatório de fechamento, rodada anterior: 442 arquivos sem padrões detectados. Auditoria npm aprovada no CI. Validações anteriores: 322 e 306 testes; nove testes de calendário passaram também em UTC+14 e Los Angeles.
- As mudanças desse lote estão commitadas e publicadas. Permanecem arquivos históricos independentes não rastreados; preservá-los.
- Último frontend publicado: `fa56487`, workflow `38797495844` aprovado; 349 testes/47 arquivos e assets de entrada/CSS/caixa de saída conferidos. Modelos publicados anteriormente em f13ae5b. Configurações publicadas anteriormente em cc2eaa6. Entregas anteriores: b981426 (qualidade/agenda) e 892bb88 (operações de agenda/histórico). Backend e backup têm entregas próprias descritas acima.
- Preservar as alterações dos outros chats e os arquivos não rastreados. Revisar antes de adicionar ao Git; não usar reset ou limpeza geral.
- Manter o login compartilhado por decisão do cliente. Contas individuais e separação por funcionário não são requisitos pendentes.
- Usar fixtures isoladas. Não enviar WhatsApp real nem fazer chamadas pagas de IA em testes automatizados.
- Alterações de produção exigem backup verificado e procedimento de retorno.
- Trabalhar em blocos substanciais, sem pedir confirmação a cada pequena etapa. Pedir informação quando ela for realmente necessária.
- Não reproduzir senhas, tokens, chaves privadas ou dumps no repositório ou nas respostas.

## 1. Concluir e publicar as alterações atuais

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 1 | Recuperação de agendamento após perda de resposta | Publicado; recuperação testada automaticamente | Criação integrada passou em homologação. Observar operação; perda de resposta não foi simulada no navegador. |
| 2 | Proteção contra cliques e operações simultâneas | Publicado; testes e estados visuais conferidos | Manter cobertura e acompanhar uso. |
| 3 | Datas de Brasília na agenda e no histórico | Publicado e conferido em homologação | Manter testes de fuso e fronteiras. |
| 4 | Atualização das métricas na virada do dia | Publicado; virada validada por simulação | Ainda falta observação prolongada da tela em uma virada real. |
| 5 | Histórico completo de avaliações | Publicado; consulta de 1.201 registros e falha parcial testadas | Interface e consulta normal conferidas; carga prolongada segue no item 38. |
| 6 | Revisão do conjunto de mudanças dos outros chats | Concluída para este lote | Arquivos relacionados publicados; históricos independentes preservados. |
| 7 | Commit e publicação deste bloco | Concluído | Commit 892bb88; workflow 38611036898 com sucesso. |
| 8 | Verificação após publicação | Concluída para leitura e carregamento | Dashboard, agenda, histórico e assets atuais conferidos. Sem operações de escrita em produção neste teste. |

## 2. Código, arquitetura e experiência de uso

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 9 | Separação completa da tela de agenda | Publicado e validado em 15/10 | Formulário, lista, fila, pendências, diálogo e tipos extraídos. Página orquestra consultas/ações; 12 novos testes de componentes/seleção. |
| 10 | Edição de observações no histórico | Publicado; edição normal e concorrente validadas em homologação | Proteção de versão, resposta autorizada, recibo de edição idêntica e erro persistente implementados. Manter acompanhamento. |
| 11 | Recuperação do formulário após reload | Limitada | O recibo preserva a tentativa; os campos não são restaurados automaticamente. Definir necessidade de rascunho e proteção dos dados. |
| 12 | Recuperação entre abas/dispositivos | Não implementada | Avaliar necessidade de recibo durável no servidor; atualmente há recuperação por aba e proteção transacional no banco. |
| 13 | Demais telas grandes | Parcial | Revisar responsabilidades em mensagens, modelos e configurações conforme os problemas encontrados. |
| 14 | Código morto e imports/variáveis não usados | Publicado e validado em 15/10 | 17 módulos desconectados removidos; lint/TypeScript de não usados ativos e alcance no CI. Primitivas UI reutilizáveis preservadas; revisão de exports individuais continua manutenção. |
| 15 | TypeScript estrito | Ativado, validado e publicado em 15/10 | strict/noImplicitAny/não usados/fallthrough ativos; contratos anuláveis corrigidos sem esconder erros. |
| 16 | Cache em toda a aplicação | Parcial; catálogo/histórico de mensagens corrigidos | Cache do catálogo/compositor invalidado após alterações; histórico usa consulta conjunta e cache limpo na troca de identidade. Demais revisões são manutenção. |
| 17 | Consultas restantes da IA | Parcial | Revisar limites, paginação, totais e indicação de respostas parciais em cada ferramenta. |
| 18 | Estados de carregamento, erro e vazio | Correções básicas publicadas | Agenda, configurações, modelos, fila e histórico distinguem falha de vazio; fila trata exceções, preserva rascunho e trava cliques. 349 testes aprovados. |
| 19 | Uso em celular e acessibilidade | Conferência básica concluída em 15/10 | Login, painel/menu, alunos/cadastro, modelos, fila, agenda e configurações conferidos em homologação. Diálogos corrigidos em telas baixas; não é certificação de todos os dispositivos. |

## 3. Segurança da aplicação e da VM

Os números desta seção vêm das últimas varreduras documentadas. Não representam uma nova varredura feita nesta atualização. Zero achados em npm audit não encerra os achados dos containers; alertas de pacotes não provam exploração.

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 20 | Inventário atualizado dos containers | Atualizado em 15/10 | Varredura final de 15 imagens/16 nomes de produção; IDs imutáveis, base e relatórios privados copiados/conferidos. |
| 21 | Dependências vulneráveis do Storage | Altos corrigidos e publicação concluída | security2: zero críticos/altos, 25 médios; 31 checks isolados e produção saudável. Tratar os médios em lote próprio. |
| 22 | Outros containers do Supabase | Lote publicado; alertas residuais abertos | PostgreSQL zero críticos/altos; Edge 1 crítico de versão zlib (Debian registra ausência do minizip afetado) e 51 altos; Realtime zero críticos/79 altos. Auth/pooler preservados conforme relatórios. Nenhum crítico/alto com correção indicada na base nos serviços ativos; isso não prova ausência de risco. Studio/Meta/imgproxy desligados sob demanda, com imagens antigas ainda vulneráveis. |
| 23 | Alertas residuais da Evolution | Acompanhamento pendente | Revisar alerta médio relacionado a RabbitMQ e aviso de situação desconhecida em OpenPGP; verificar antes de habilitar AMQP. |
| 24 | Atualizações futuras da Evolution | Processo pendente de consolidação | Preservar licença, sessão e ajustes necessários; validar compatibilidade e retorno. |
| 25 | Alertas médios/baixos dos gateways | Atualizados e triados em 15/10 | Nginx sem achados; Envoy 14 médios/16 baixos; Cloudflared recompilado/publicado com zero críticos/altos/médios/baixos e um desconhecido. Manutenção periódica continua. |
| 26 | Segurança da borda pública | TLS, bloqueios e cabeçalhos conferidos em 15/10 | HSTS/nosniff/no-referrer publicados com ensaio isolado e backup; Auth/CORS preservados. Conferência parcial, não pentest exaustivo; revisar políticas específicas de arquivos/frontend. |
| 27 | Rotação das credenciais compartilhadas no histórico | Senha do dono trocada e logout global verificado em 15/10 | Novo login/dashboard aprovados; sete sessões antigas removidas e refresh recusado. Senha em arquivo privado, plano aplicado; demais credenciais técnicas/provedores continuam com inventário/rotação próprios. Access tokens antigos valem até expirar. |
| 28 | Revisão final de permissões | Matriz consolidada e catálogo conferido em 15/10 | 15 tabelas públicas com RLS e nenhum privilégio anon; 31 funções e Storage inventariados. Ver permissoes-2026-10-15.md para cobertura/limites; manter revisão de políticas/corpos e futuras mudanças. |
| 29 | Política contínua de atualização e varredura | Procedimento documentado; responsável a definir | docs/SECURITY-MAINTENANCE.md define verificações por publicação, rotina proposta e triagem. Não equivale a novo monitoramento/agendamento instalado; confirmar responsável operacional. |
| 30 | Encerramento formal da auditoria de segurança | Rodada básica documentada; riscos residuais abertos | Correções publicadas, backups/retorno, exceção de versão zlib e limites registrados no fechamento. Não declarar segurança integral nem tratar ausência de correção indicada como ausência de risco. |

## 4. Backups, recuperação e operação

Existem evidências anteriores de backups verificados e de homologação. Não concluir que os artefatos privados estão ausentes porque não estão no Git. O núcleo integrado foi restaurado com evidência em 15/10; o exercício de desastre em host vazio e serviços externos continua parcial.

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 31 | Restauração completa em ambiente isolado | Núcleo e dados Evolution comprovados novamente | Snapshot final 20261015T195613Z: 39 checks/18,97 s com imagens prontas; três bancos Evolution, contagens/reinício/cleanup aprovados. Host vazio, DNS/TLS, pooler/Realtime no exercício de desastre e reconexão do provedor em outro host continuam sem prova. |
| 32 | Funcionamento atual dos backups automáticos | Serviço ampliado validado sob demanda | Timer ativo; execuções pelo próprio serviço systemd e cópia/hash aprovadas, incluindo cache Deno/Evolution. Primeiro disparo natural após ambas as ampliações ainda aguarda 16/10; não foi simulado como automático. |
| 33 | Independência e retenção das cópias | Cópias e imagens customizadas verificadas; independência externa pendente | Auth/pooler/PostgREST e agora Storage/Nginx/Evolution exportados e verificados; estes últimos 21/11/11 blobs OCI. Cliente informou em 15/10 não possuir destino externo; falta definir serviço e política final. Hoje são 14 snapshots completos, não dias. Imagem Evolution não substitui seus dados; estes foram incluídos em runtime.tar.gz e restaurados em isolamento em 15/10. Reconexão/licença em outro host não testadas. |
| 34 | Tempo e perda máxima de recuperação | Medição técnica realizada; metas operacionais pendentes | Restore integrado 20,42 s com imagens prontas e poucos dados. Não inclui provisionamento/DNS/TLS/provedores; definir RTO completo e RPO aceitáveis. Intervalo diário nominal de backup não é garantia de RPO. |
| 35 | Primeira execução diária natural das automações | Dois ciclos confirmados por leitura | 14 e 15/10 às 08h de Brasília: success, sem erro, zero candidatos/inserções; jobs ativos e fila sem pendentes/processando. Acompanhar cenários com candidatos e estabilidade prolongada. |
| 36 | Estabilidade prolongada da fila | Operação atual saudável; monitor instalado | Zero pendentes atrasados/processando presos; WhatsApp conectado, jobs e respostas recentes aprovados. Monitor local cinco minutos. Vários dias de operação e candidatos reais ainda exigem acompanhamento. |
| 37 | Reconciliação de mensagens antigas falhas/incertas | Triagem técnica concluída; reenvio não autorizado | 35 falhas antigas, zero recibos de sucesso conflitantes/duplicados no banco e nenhum dispatch_started_at. Falta de recibo histórico não prova não entrega. Preservadas sem repetir/cancelar; conferir WhatsApp individualmente se houver intenção de reenviar. |
| 38 | Testes de carga | Pendente | Medir comportamento com mais alunos, mensagens, avaliações e consultas concorrentes. |
| 39 | Recursos adicionais do Storage | Não validados no lote anterior | Testar TUS, S3 e transformação de imagens se forem utilizados. |
| 40 | Recuperação de senha por email | Dispensada pelo cliente em 15/10 | Manter perfil pré-configurado do dono e recuperação administrativa pela VM. Não configurar SMTP, signup público ou contas individuais como requisito deste projeto. |
| 41 | Gemini real | Sem validação completa | Conferir modelo, credencial, geração, timeout e qualidade com chamada controlada. |
| 42 | Monitoramento operacional | Monitor local instalado e aprovado | 27 verificações de serviços, fila, WhatsApp, jobs/HTTP, backup, espaço e containers de retorno. Timer cinco minutos; alertas em systemd/JSON privado. Não há notificação externa nem observador fora da VM. |
| 43 | Estado dos antigos projetos Supabase | Não confirmado | Verificar exclusão de WORKOUT01/02/03 e documentar o destino da cópia Cloud do WORKOUT04. |

## 5. Performance, documentação e manutenção

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 44 | Performance real do frontend | Bundle por rotas e uso básico em celular conferidos | Diálogos/rolagem corrigidos. Medições de rede lenta e carga maior ficam para evolução conforme necessidade. |
| 45 | Consultas que carregam todos os registros | Ainda existem | Avaliar paginação e filtros no servidor conforme o volume crescer. |
| 46 | README completo | Ampliado em 15/10 | Configuração pública, comandos, backend self-hosted, CI e limites documentados; manter atualizado com futuras entregas. |
| 47 | Runbook operacional | Atualizado com runtimes, recuperação e monitor | Procedimentos correntes e riscos/retorno documentados. Host vazio, serviços externos e destino independente continuam limitações explícitas. |
| 48 | Deploy de frontend e backend | Processos existentes | Documentar dependências, ordem de migrações e compatibilidade entre versões. |
| 49 | Organização das evidências | Índice criado em 15/10 | docs/auditoria-2026-10-11/README.md relaciona entregas atuais e fotografias históricas. Manter a cada publicação. |
| 50 | Arquivos locais não rastreados | Existem documentos e scripts | Revisar o que deve entrar no Git e manter material privado fora dele. |
| 51 | Matriz final da auditoria | Consolidada para a rodada básica | Relatório de fechamento relaciona correções, provas, publicação e limites; backlog histórico mantido, sem transformar melhorias futuras em bloqueios ao layout. |

## 6. Melhorias de produto discutidas — definir escopo

São propostas de evolução. Nem todas foram implementadas ou aprovadas como entrega obrigatória do próximo lote. A conclusão de correções técnicas não exige implementar indiscriminadamente todo este backlog.

| Nº | Melhoria | O que envolveria |
| --- | --- | --- |
| 52 | Painel de trabalho diário | Implementado localmente em 18/10: agenda, baixas pendentes, prazos para conferir, falhas e contatos com acesso à ficha. Aguarda revisão visual e publicação; não apresenta vencimento como dívida comprovada. |
| 53 | Linha do tempo do aluno | Reunir mensagens, avaliações, alterações e eventos relevantes. |
| 54 | Arquivamento de alunos | Definir desativação, preservação de histórico e prevenção de exclusões indevidas. |
| 55 | Importação CSV | Prévia, validação, identificação de duplicidades e relatório de erros. |
| 56 | Campanhas com estados claros | Rascunho, programação, execução, pausa, conclusão e cancelamento. |
| 57 | Preferências de contato e opt-out | Implementado localmente: permissão global por aluno, cancelamento seguro de pendentes, bloqueio no compositor/fila/dispatch e manutenção da matrícula. Aprovado pelo cliente; aguarda homologação e publicação. Categorias por assunto não foram implementadas. |
| 58 | Horários de silêncio e frequência global | Evitar horários inadequados e excesso de mensagens ao mesmo aluno. |
| 59 | Recepção de respostas do WhatsApp | Processar eventos e respostas para atualizar o atendimento. |
| 60 | Interromper sequências após resposta | Evitar lembretes inadequados quando o aluno já respondeu. |
| 61 | Avaliação física estruturada | Medidas, protocolos, resultados, evolução e anexos, além de agenda e observações. |
| 62 | Financeiro completo | Valores, cobranças, pagamentos, histórico, estornos e planos. |
| 63 | Métricas de resultado | Medir retorno, agendamento e conversão, além da quantidade enviada. |

## O que já foi feito e não deve voltar à lista como intocado

- Migração do backend operacional para Supabase self-hosted na VM Oracle, preservando logins e dados conforme relatórios.
- Correção dos erros de lint do diagnóstico original. Os 142 erros e 19 avisos eram números iniciais; o estado validado atual tem lint zerado.
- Proteções de autenticação/autorização, restrições de funções internas e sanitização de erros.
- Fila transacional, controle de execução do worker, correções de recorrência e tratamento de resultados incertos.
- Operações transacionais de avaliações e consulta centralizada de conflitos.
- Confirmações duráveis e persistência de conversas da IA.
- Cotas persistentes, validações de contratos e barreiras contra segredos no frontend/repositório.
- Dashboard com consulta central e RLS; diversas correções de paginação, templates e automações.
- Parte da limpeza e arquitetura das telas de alunos, automações, mensagens e módulos compartilhados.
- Carregamento de rotas sob demanda e recuperação de falhas de importação/renderização.
- Atualizações de segurança publicadas para Evolution, gateways e parte do Storage, com dívidas residuais documentadas.
- CI, AGENTS.md, ferramentas de operação e relatórios de evidência.

## Ordem de retomada

1. Ler `AGENTS.md`, este arquivo, o handoff detalhado e o relatório do último bloco. Conferir Git antes de alterar.
2. O lote de agenda/histórico já foi publicado e verificado. Não repetir essa publicação como se estivesse pendente; preservar arquivos dos demais chats.
3. Priorizar as pendências de risco: inventário e vulnerabilidades dos containers, restauração completa, credenciais e evidência da operação diária.
4. Continuar qualidade, arquitetura, performance e documentação em blocos verificáveis.
5. Tratar melhorias de produto com escopo definido pelo cliente.

Ao atualizar esta matriz, registrar a evidência e distinguir: proposto, implementado localmente, validado, publicado e verificado em produção. Não declarar a auditoria inteira concluída apenas porque a suíte passou.
