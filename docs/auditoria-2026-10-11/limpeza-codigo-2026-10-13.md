# Limpeza de código — 13/10/2026

## Escopo e resultado

Lote local do item 1 da auditoria: organização do frontend, eliminação de duplicações e correções de falhas encontradas durante a refatoração. Nenhuma alteração deste lote foi publicada na VM ou no GitHub.

| Área | Resultado |
| --- | --- |
| Lista de alunos | Tela reduzida de 782 para 299 linhas. Consultas, filtros, preferências, ações, filtros rápidos e resultados foram separados por responsabilidade. |
| Automações | Tela reduzida de 656 para 149 linhas. Catálogo, consultas/mutações, cartão e formulário de criação agora têm módulos próprios. |
| Mensagens | Carregamento separado em `useMessageComposerData`; seletor de destinatários separado da composição e do envio. |
| Filtros de mensagens | Funções puras separadas das listas. Contagem e renderização das mensagens enviadas usam a mesma filtragem. |
| Infraestrutura React | Provider de autenticação separado do hook/contexto; hooks de tema e sidebar separados dos componentes; variantes e estado de confirmação separados da UI. |
| Lint | Regra `react-refresh/only-export-components` reativada. Os 15 avisos foram resolvidos pela organização dos exports, sem desativar a regra ou adicionar exceções. |

## Falhas corrigidas

- A lista de alunos diferencia falha de consulta de cadastro vazio e oferece nova tentativa.
- Preferências de colunas aceitam somente chaves conhecidas com valores booleanos, com recuperação de JSON inválido.
- Mensagens pendentes dos alunos usam paginação completa, contagem exata e ordenação por identificador. A tela informa falhas na atualização desses indicadores.
- Removida consulta de mensagens recentes cujo resultado não era utilizado; removida invalidação duplicada do dashboard.
- Aniversários são apresentados como datas de calendário, evitando recuo de um dia causado por parsing de meia-noite UTC no fuso de Brasília.
- A seleção em massa de destinatários opera sobre os resultados visíveis e preserva seleções fora da busca. Quantidades iguais de conjuntos diferentes já não causam desmarcação incorreta.
- O parâmetro de aluno na URL é validado e mudanças de aba deixam de reiniciar a seleção por alteração do objeto de parâmetros.
- O compositor informa falha ao carregar alunos/modelos e permite tentar novamente.
- Tema armazenado inválido usa o padrão; tema do sistema acompanha mudanças do sistema operacional; notificações usam o mesmo provider da aplicação.
- Imports sem uso foram removidos nos módulos editados. Logs de diagnóstico removidos anteriormente permanecem removidos.

## Validação

- `npm run lint`: passou, sem erros ou avisos.
- `npx tsc --noEmit -p tsconfig.app.json`: passou.
- `npm test`: 155 testes passaram em 22 arquivos.
- `npm run build`: passou.
- `git -c core.autocrlf=false -c core.whitespace=cr-at-eol diff --check`: passou.

Os novos testes cobrem preferências inválidas, falha/repetição de carregamento de alunos, aniversário, busca e limpeza de filtros, mudanças de tema e seleção em massa após uma busca. As verificações são locais, sem disparos reais de WhatsApp.

## Limites e continuidade

Este registro não encerra a auditoria inteira. Segurança final, revisão arquitetural mais ampla, performance e documentação operacional continuam como etapas próprias. A rotina de agendamento/envio e a tela de avaliações ainda merecem revisão específica. O lint global mantém a configuração anterior de variáveis não utilizadas; a limpeza de imports deste lote não equivale a verificar código morto em todo o repositório.

Uma publicação deste lote ainda exige o procedimento de backup, implantação e conferência operacional descrito nos documentos de operações.
