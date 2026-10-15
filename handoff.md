# Workout — handoff e pendências consolidadas

Atualização: 15/10/2026. Este é o ponto de entrada para continuar a auditoria. Contém os 63 itens da tabela consolidada da conversa, incluindo implementação, publicação, infraestrutura, documentação e propostas de produto.

Índice das entregas mais recentes: [evidências](docs/auditoria-2026-10-11/README.md). O histórico detalhado, decisões, arquitetura, commits e procedimentos estão em [HANDOFF-AUDITORIA-2026-10-14.md](docs/HANDOFF-AUDITORIA-2026-10-14.md). As evidências do último bloco estão em [agenda-recuperacao-local-2026-10-14.md](docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md). Em caso de divergência, distinguir data, código local, validação e versão publicada.

## Estado atual e regras de continuidade

> Studio/Meta sob demanda em 15/10: perfil admin, restart no, ambos desligados; gateway agora depende do banco. Dez verificações isoladas com os dois serviços ausentes e 20 em produção, repetidas; dados/senhas preservados, rotas externas e WebSocket conferidos. Backup pós 20261015T184842Z copiado/hashes conferidos e compose validado dentro do arquivo. As imagens antigas não foram corrigidas e outros containers continuam com pendências. Ver [relatório](docs/auditoria-2026-10-11/admin-sob-demanda-2026-10-15.md).

> Troca da senha do proprietário aguardando resposta: senha.txt e plan.json preparados privadamente em C:/Users/pejon/.codex/ssh-workout04/owner-password-20261015/. Nenhuma senha alterada ou sessão encerrada. Pergunta pendente autoriza especificamente aplicar a nova senha e encerrar sessões antigas; aguardar resposta, pois o dono precisará entrar novamente. Conferir identidade/fingerprint do perfil e hash do candidato antes de aplicar; não confundir preparo com rotação concluída.

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

- Última rodada publicada: tipos estritos, limpeza de 17 módulos e separação da interface da agenda, com correção de pré-seleção após refetch. A entrega funcional anterior acrescentou recuperação de criação, recibo, trava, calendário/métricas e histórico com edição concorrente de notas.
- Validação atual: **328 testes em 41 arquivos; lint, tipos estritos, alcance e build aprovados**; CI de cc2eaa6 aprovado, scanner pré-publicação: 430 arquivos sem padrões detectados. Auditoria npm aprovada no CI. Validações anteriores: 322 e 306 testes; nove testes de calendário passaram também em UTC+14 e Los Angeles.
- As mudanças desse lote estão commitadas e publicadas. Permanecem arquivos históricos independentes não rastreados; preservá-los.
- Último frontend publicado: `cc2eaa6`, workflow `38778303244` aprovado; 328 testes/41 arquivos e assets de entrada/configurações conferidos. Entregas anteriores: b981426 (qualidade/agenda) e 892bb88 (operações de agenda/histórico). Backend e backup têm entregas próprias descritas acima.
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
| 16 | Cache em toda a aplicação | Parcial | Conferir invalidação, troca de identidade, respostas atrasadas e dados antigos nas telas restantes. |
| 17 | Consultas restantes da IA | Parcial | Revisar limites, paginação, totais e indicação de respostas parciais em cada ferramenta. |
| 18 | Estados de carregamento, erro e vazio | Agenda e configurações corrigidas/publicadas; demais telas em manutenção | Configurações têm erro/repetição e bloqueiam edição de dados antigos após falha; intervalo reverte se não salvo. Corrigir falhas concretas das demais telas conforme uso. |
| 19 | Uso em celular e acessibilidade | Parcial | Revisar formulários, tabelas, diálogos, navegação por teclado e telas menores no conjunto completo. |

## 3. Segurança da aplicação e da VM

Os números desta seção vêm das últimas varreduras documentadas. Não representam uma nova varredura feita nesta atualização. Zero achados em npm audit não encerra os achados dos containers; alertas de pacotes não provam exploração.

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 20 | Inventário atualizado dos containers | Concluído para o snapshot de 14/10 | Varredura de 15 imagens/16 containers, IDs imutáveis e evidência privada copiada. Manter atualização periódica. |
| 21 | Dependências vulneráveis do Storage | Altos corrigidos e publicação concluída | security2: zero críticos/altos, 25 médios; 31 checks isolados e produção saudável. Tratar os médios em lote próprio. |
| 22 | Outros containers do Supabase | Auth, pooler e PostgREST endurecidos e publicados; demais pendentes | Auth: 42 checks isolados/19 em produção e reinício; 30 altos → um alto residual de versão com correção local, cinco baixos/um desconhecido. PostgREST: zero críticos/altos, 37 médios/quatro baixos. Pooler: zero críticos/48 altos revisados e contas limitadas. Studio/Meta passaram a ficar desligados sob demanda, sem corrigir suas imagens antigas. Resolver residuais e revisar Edge Runtime, Realtime, PostgreSQL e auxiliares. Não atualizar banco automaticamente. |
| 23 | Alertas residuais da Evolution | Acompanhamento pendente | Revisar alerta médio relacionado a RabbitMQ e aviso de situação desconhecida em OpenPGP; verificar antes de habilitar AMQP. |
| 24 | Atualizações futuras da Evolution | Processo pendente de consolidação | Preservar licença, sessão e ajustes necessários; validar compatibilidade e retorno. |
| 25 | Alertas médios/baixos dos gateways | Não encerrado | Avaliar os restantes e atualizar a varredura de Nginx/Envoy. |
| 26 | Segurança da borda pública | TLS, bloqueios e cabeçalhos conferidos em 15/10 | HSTS/nosniff/no-referrer publicados com ensaio isolado e backup; Auth/CORS preservados. Conferência parcial, não pentest exaustivo; revisar políticas específicas de arquivos/frontend. |
| 27 | Rotação das credenciais compartilhadas no histórico | Senha do dono preparada; aplicação aguarda resposta | Candidato em diretório privado com ACL restrita e plano/fingerprint. A troca exigirá novo login e encerramento de sessões; pergunta pendente. Demais credenciais ainda precisam de inventário/rotação coordenada, sem tratar chaves públicas anon como segredos. |
| 28 | Revisão final de permissões | Matriz consolidada e catálogo conferido em 15/10 | 15 tabelas públicas com RLS e nenhum privilégio anon; 31 funções e Storage inventariados. Ver permissoes-2026-10-15.md para cobertura/limites; manter revisão de políticas/corpos e futuras mudanças. |
| 29 | Política contínua de atualização e varredura | Procedimento documentado; responsável a definir | docs/SECURITY-MAINTENANCE.md define verificações por publicação, rotina proposta e triagem. Não equivale a novo monitoramento/agendamento instalado; confirmar responsável operacional. |
| 30 | Encerramento formal da auditoria de segurança | Pendente | Classificar riscos restantes, registrar correções, exceções justificadas e evidências. |

## 4. Backups, recuperação e operação

Existem evidências anteriores de backups verificados e de homologação. Não concluir que os artefatos privados estão ausentes porque não estão no Git. O núcleo integrado foi restaurado com evidência em 15/10; o exercício de desastre em host vazio e serviços externos continua parcial.

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 31 | Restauração completa em ambiente isolado | Núcleo integrado comprovado; desastre completo ainda parcial | Snapshot `20261015T174108Z`: núcleo Workout repetiu 39 checks; três bancos/configuração Evolution também restaurados e persistiram após reinício isolado. Imagens disponíveis; host vazio, DNS/TLS, Realtime, processo do pooler e reconexão do provedor ainda sem prova. |
| 32 | Funcionamento atual dos backups automáticos | Cobertura ampliada confirmada; cache Deno acrescentado depois | Automático `20261015T060345Z`: cinco arquivos copiados/hashes conferidos. SHA256 no manifesto/sincronização; cache Deno acrescentado a runtime.tar.gz e provado no restore `20261015T162649Z`. Evolution acrescentada ao runtime.tar.gz em 15/10 e provada no snapshot 20261015T174108Z. Observar primeiro automático com ambas as ampliações; timer ativo. |
| 33 | Independência e retenção das cópias | Cópias e imagens customizadas verificadas; independência externa pendente | Auth/pooler/PostgREST e agora Storage/Nginx/Evolution exportados e verificados; estes últimos 21/11/11 blobs OCI. Cliente informou em 15/10 não possuir destino externo; falta definir serviço e política final. Hoje são 14 snapshots completos, não dias. Imagem Evolution não substitui seus dados; estes foram incluídos em runtime.tar.gz e restaurados em isolamento em 15/10. Reconexão/licença em outro host não testadas. |
| 34 | Tempo e perda máxima de recuperação | Medição técnica realizada; metas operacionais pendentes | Restore integrado 20,42 s com imagens prontas e poucos dados. Não inclui provisionamento/DNS/TLS/provedores; definir RTO completo e RPO aceitáveis. Intervalo diário nominal de backup não é garantia de RPO. |
| 35 | Primeira execução diária natural das automações | Dois ciclos confirmados por leitura | 14 e 15/10 às 08h de Brasília: success, sem erro, zero candidatos/inserções; jobs ativos e fila sem pendentes/processando. Acompanhar cenários com candidatos e estabilidade prolongada. |
| 36 | Estabilidade prolongada da fila | Validação parcial | Observar operação contínua, reconexões, latência, falhas e recuperação. |
| 37 | Reconciliação de mensagens antigas falhas/incertas | Pendente de análise operacional | Conferir o ocorrido antes de decidir qualquer repetição. |
| 38 | Testes de carga | Pendente | Medir comportamento com mais alunos, mensagens, avaliações e consultas concorrentes. |
| 39 | Recursos adicionais do Storage | Não validados no lote anterior | Testar TUS, S3 e transformação de imagens se forem utilizados. |
| 40 | Recuperação de senha por email | Dispensada pelo cliente em 15/10 | Manter perfil pré-configurado do dono e recuperação administrativa pela VM. Não configurar SMTP, signup público ou contas individuais como requisito deste projeto. |
| 41 | Gemini real | Sem validação completa | Conferir modelo, credencial, geração, timeout e qualidade com chamada controlada. |
| 42 | Monitoramento operacional | Parcial | Consolidar alertas úteis de backup, automações, fila, conexão e indisponibilidade. |
| 43 | Estado dos antigos projetos Supabase | Não confirmado | Verificar exclusão de WORKOUT01/02/03 e documentar o destino da cópia Cloud do WORKOUT04. |

## 5. Performance, documentação e manutenção

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 44 | Performance real do frontend | Bundle e carregamento por rotas melhoraram | Medir carregamento em celular/rede lenta, navegação e consumo de recursos. |
| 45 | Consultas que carregam todos os registros | Ainda existem | Avaliar paginação e filtros no servidor conforme o volume crescer. |
| 46 | README completo | Ampliado em 15/10 | Configuração pública, comandos, backend self-hosted, CI e limites documentados; manter atualizado com futuras entregas. |
| 47 | Runbook operacional | Atualizado; recuperação completa pendente | Backup de cinco arquivos, restore de metadados, contas limitadas, migrações administrativas e publicação/retorno de pooler/PostgREST documentados. Completar recuperação integrada, incidentes e armazenamento externo. |
| 48 | Deploy de frontend e backend | Processos existentes | Documentar dependências, ordem de migrações e compatibilidade entre versões. |
| 49 | Organização das evidências | Índice criado em 15/10 | docs/auditoria-2026-10-11/README.md relaciona entregas atuais e fotografias históricas. Manter a cada publicação. |
| 50 | Arquivos locais não rastreados | Existem documentos e scripts | Revisar o que deve entrar no Git e manter material privado fora dele. |
| 51 | Matriz final da auditoria | Parcial | Relacionar cada achado a correção, commit, teste, publicação ou pendência justificada. |

## 6. Melhorias de produto discutidas — definir escopo

São propostas de evolução. Nem todas foram implementadas ou aprovadas como entrega obrigatória do próximo lote. A conclusão de correções técnicas não exige implementar indiscriminadamente todo este backlog.

| Nº | Melhoria | O que envolveria |
| --- | --- | --- |
| 52 | Painel de trabalho diário | Pendências acionáveis: alunos para contatar, avaliações, cobranças e falhas. |
| 53 | Linha do tempo do aluno | Reunir mensagens, avaliações, alterações e eventos relevantes. |
| 54 | Arquivamento de alunos | Definir desativação, preservação de histórico e prevenção de exclusões indevidas. |
| 55 | Importação CSV | Prévia, validação, identificação de duplicidades e relatório de erros. |
| 56 | Campanhas com estados claros | Rascunho, programação, execução, pausa, conclusão e cancelamento. |
| 57 | Preferências de contato e opt-out | Registrar quem pode receber cada tipo de mensagem e respeitar recusas. |
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
