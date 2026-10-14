# Workout — handoff e pendências consolidadas

Atualização: 14/10/2026. Este é o ponto de entrada para continuar a auditoria. Contém os 63 itens da tabela consolidada da conversa, incluindo implementação, publicação, infraestrutura, documentação e propostas de produto.

O histórico detalhado, decisões, arquitetura, commits e procedimentos estão em [HANDOFF-AUDITORIA-2026-10-14.md](docs/HANDOFF-AUDITORIA-2026-10-14.md). As evidências do último bloco estão em [agenda-recuperacao-local-2026-10-14.md](docs/auditoria-2026-10-11/agenda-recuperacao-local-2026-10-14.md). Em caso de divergência, distinguir data, código local, validação e versão publicada.

## Estado atual e regras de continuidade

> Atualização posterior: homologação integrada concluída para criação, remarcação, histórico, edição normal e conflito de notas; 306 testes em 36 arquivos. Backup novo `20261014T175538Z`, quatro arquivos copiados e hashes conferidos. Ver [relatório da homologação/publicação](docs/auditoria-2026-10-11/agenda-publicacao-2026-10-14.md) para o estado final da entrega; as linhas históricas abaixo descrevem a preparação anterior.

- Última rodada implementada localmente: recuperação de criação de avaliação após perda de resposta; recibo separado por identidade; trava síncrona; calendário de Brasília; atualização das métricas; paginação e erro explícito no histórico.
- Validação registrada: **298 testes em 35 arquivos, sendo 24 novos; lint, tipos e build aprovados**. Os nove testes de calendário passaram também em UTC+14 e Los Angeles. Scanner: 381 arquivos, sem padrões de credenciais detectados.
- Essas mudanças ainda estão **sem commit e sem publicação**. Não confundir arquivos locais com a versão servida ao cliente.
- Último código publicado documentado: `24056d2`; documentação posterior: `a92f387`. Não houve nova inspeção de produção para escrever este arquivo.
- Preservar as alterações dos outros chats e os arquivos não rastreados. Revisar antes de adicionar ao Git; não usar reset ou limpeza geral.
- Manter o login compartilhado por decisão do cliente. Contas individuais e separação por funcionário não são requisitos pendentes.
- Usar fixtures isoladas. Não enviar WhatsApp real nem fazer chamadas pagas de IA em testes automatizados.
- Alterações de produção exigem backup verificado e procedimento de retorno.
- Trabalhar em blocos substanciais, sem pedir confirmação a cada pequena etapa. Pedir informação quando ela for realmente necessária.
- Não reproduzir senhas, tokens, chaves privadas ou dumps no repositório ou nas respostas.

## 1. Concluir e publicar as alterações atuais

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 1 | Recuperação de agendamento após perda de resposta | Implementado e testado localmente | Validar o fluxo integrado na interface antes de publicar. |
| 2 | Proteção contra cliques e operações simultâneas | Implementado e testado localmente | Conferir comportamento visual durante consultas e confirmações. |
| 3 | Datas de Brasília na agenda e no histórico | Implementado e testado localmente | Conferir apresentação nas telas com dados de homologação. |
| 4 | Atualização das métricas na virada do dia | Implementado e testado localmente | Validação integrada da tela aberta por período prolongado. |
| 5 | Histórico completo de avaliações | Paginação e tratamento de erro implementados | Conferir interface com muitos registros e falha de carregamento. |
| 6 | Revisão do conjunto de mudanças dos outros chats | Parcial | Selecionar arquivos relacionados e preservar alterações independentes. |
| 7 | Commit e publicação deste bloco | Pendente | Consolidar o commit, publicar pelo fluxo adequado e verificar a versão servida. |
| 8 | Verificação após publicação | Pendente | Conferir agenda, histórico e fluxos principais, com retorno preparado. |

## 2. Código, arquitetura e experiência de uso

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 9 | Separação completa da tela de agenda | Parcial | Consultas, métricas e ações foram extraídas; ainda separar formulário, diálogos e componentes maiores. |
| 10 | Edição de observações no histórico | Corrigido, testado e validado em homologação | Publicar e conferir a versão servida; conflito preserva o texto e não sobrescreve outra edição. |
| 11 | Recuperação do formulário após reload | Limitada | O recibo preserva a tentativa; os campos não são restaurados automaticamente. Definir necessidade de rascunho e proteção dos dados. |
| 12 | Recuperação entre abas/dispositivos | Não implementada | Avaliar necessidade de recibo durável no servidor; atualmente há recuperação por aba e proteção transacional no banco. |
| 13 | Demais telas grandes | Parcial | Revisar responsabilidades em mensagens, modelos e configurações conforme os problemas encontrados. |
| 14 | Código morto e imports/variáveis não usados | Não encerrado | Revisar e ativar verificações hoje desativadas. |
| 15 | TypeScript estrito | Pendente | Ativar gradualmente strict, noImplicitAny e verificações de variáveis/parâmetros não usados. |
| 16 | Cache em toda a aplicação | Parcial | Conferir invalidação, troca de identidade, respostas atrasadas e dados antigos nas telas restantes. |
| 17 | Consultas restantes da IA | Parcial | Revisar limites, paginação, totais e indicação de respostas parciais em cada ferramenta. |
| 18 | Estados de carregamento, erro e vazio | Parcial | Continuar procurando telas que confundem falha de consulta com ausência de dados. |
| 19 | Uso em celular e acessibilidade | Parcial | Revisar formulários, tabelas, diálogos, navegação por teclado e telas menores no conjunto completo. |

## 3. Segurança da aplicação e da VM

Os números desta seção vêm das últimas varreduras documentadas. Não representam uma nova varredura feita nesta atualização. Zero achados em npm audit não encerra os achados dos containers; alertas de pacotes não provam exploração.

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 20 | Inventário atualizado dos containers | Pendente de nova conferência | Comparar imagens realmente executadas com os relatórios anteriores. |
| 21 | Dependências vulneráveis do Storage | Aberto | A última imagem publicada ficou com zero críticos e 41 alertas altos; atualizar dependências com testes de compatibilidade. |
| 22 | Outros containers do Supabase | Auditoria incompleta | Revisar Auth, Realtime, Studio, Meta, Supavisor, PostgREST, PostgreSQL e componentes auxiliares. |
| 23 | Alertas residuais da Evolution | Acompanhamento pendente | Revisar alerta médio relacionado a RabbitMQ e aviso de situação desconhecida em OpenPGP; verificar antes de habilitar AMQP. |
| 24 | Atualizações futuras da Evolution | Processo pendente de consolidação | Preservar licença, sessão e ajustes necessários; validar compatibilidade e retorno. |
| 25 | Alertas médios/baixos dos gateways | Não encerrado | Avaliar os restantes e atualizar a varredura de Nginx/Envoy. |
| 26 | Segurança da borda pública | Validação parcial | Conferir exposição efetiva, rotas administrativas, TLS, cabeçalhos, limites e comportamento externo. |
| 27 | Rotação das credenciais compartilhadas no histórico | Sem comprovação de conclusão | Inventariar e trocar de forma coordenada, atualizando os serviços dependentes. |
| 28 | Revisão final de permissões | Várias correções já publicadas | Consolidar matriz de tabelas, funções, Storage e papéis, incluindo testes negativos. |
| 29 | Política contínua de atualização e varredura | Parcial | Definir frequência, responsáveis, critérios de correção e registro das versões. |
| 30 | Encerramento formal da auditoria de segurança | Pendente | Classificar riscos restantes, registrar correções, exceções justificadas e evidências. |

## 4. Backups, recuperação e operação

Existem evidências anteriores de backups verificados e de homologação. Não concluir que os artefatos privados estão ausentes porque não estão no Git. O exercício completo de restauração continua sem evidência de conclusão.

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 31 | Restauração completa em ambiente isolado | Pendente | Restaurar banco, Auth, arquivos e funções e verificar funcionamento integrado. |
| 32 | Funcionamento atual dos backups automáticos | Configurado anteriormente | Conferir execuções recentes, falhas e integridade das cópias. |
| 33 | Independência e retenção das cópias | Revisão pendente | Avaliar cópias fora da VM, dependência do computador local e política de retenção. |
| 34 | Tempo e perda máxima de recuperação | Não definidos formalmente | Medir o restore e registrar RTO/RPO compatíveis com a academia. |
| 35 | Primeira execução diária natural das automações | Falta evidência consolidada | Consultar o histórico já produzido e conferir resultados, sem disparar mensagens apenas para testar. |
| 36 | Estabilidade prolongada da fila | Validação parcial | Observar operação contínua, reconexões, latência, falhas e recuperação. |
| 37 | Reconciliação de mensagens antigas falhas/incertas | Pendente de análise operacional | Conferir o ocorrido antes de decidir qualquer repetição. |
| 38 | Testes de carga | Pendente | Medir comportamento com mais alunos, mensagens, avaliações e consultas concorrentes. |
| 39 | Recursos adicionais do Storage | Não validados no lote anterior | Testar TUS, S3 e transformação de imagens se forem utilizados. |
| 40 | Recuperação de senha por email | SMTP pendente conforme último relatório | Configurar e validar envio e recuperação. |
| 41 | Gemini real | Sem validação completa | Conferir modelo, credencial, geração, timeout e qualidade com chamada controlada. |
| 42 | Monitoramento operacional | Parcial | Consolidar alertas úteis de backup, automações, fila, conexão e indisponibilidade. |
| 43 | Estado dos antigos projetos Supabase | Não confirmado | Verificar exclusão de WORKOUT01/02/03 e documentar o destino da cópia Cloud do WORKOUT04. |

## 5. Performance, documentação e manutenção

| Nº | Item | Situação | O que falta |
| --- | --- | --- | --- |
| 44 | Performance real do frontend | Bundle e carregamento por rotas melhoraram | Medir carregamento em celular/rede lenta, navegação e consumo de recursos. |
| 45 | Consultas que carregam todos os registros | Ainda existem | Avaliar paginação e filtros no servidor conforme o volume crescer. |
| 46 | README completo | Iniciado pelo outro chat | Completar configuração, execução local, arquitetura e referências operacionais. |
| 47 | Runbook operacional | Criado, ainda parcial | Detalhar comandos e procedimentos comprovados de publicação, backup, restore, retorno e incidentes. |
| 48 | Deploy de frontend e backend | Processos existentes | Documentar dependências, ordem de migrações e compatibilidade entre versões. |
| 49 | Organização das evidências | Muitos relatórios disponíveis | Criar índice consolidado e indicar quais relatórios substituem os anteriores. |
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
2. Validar visualmente e consolidar a publicação das alterações locais da agenda/histórico, preservando o trabalho dos demais chats.
3. Priorizar as pendências de risco: inventário e vulnerabilidades dos containers, restauração completa, credenciais e evidência da operação diária.
4. Continuar qualidade, arquitetura, performance e documentação em blocos verificáveis.
5. Tratar melhorias de produto com escopo definido pelo cliente.

Ao atualizar esta matriz, registrar a evidência e distinguir: proposto, implementado localmente, validado, publicado e verificado em produção. Não declarar a auditoria inteira concluída apenas porque a suíte passou.
