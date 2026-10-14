# Revisão de segurança — 14/10/2026

> Atualização: a implantação posterior está registrada em [Publicação de 14/10/2026](publicacao-2026-10-14.md).

## Estado

Revisados código, histórico Git, dependências, handlers HTTP, permissões SQL e configuração ativa da VM. As correções deste lote estão locais; nenhuma função, migração, conta ou configuração de produção foi alterada.

## Correções implementadas

- `send-oneshot` deixou de devolver o corpo bruto da Evolution e exceções internas. O adaptador compartilhado também removeu `bodyText` e erros arbitrários do provedor das respostas.
- Leitor compartilhado valida POST, media type JSON, objeto raiz e quantidade real de bytes recebidos, mesmo sem Content-Length ou com cabeçalho incorreto. Responde 400/405/413/415 conforme a falha.
- Envio avulso: telefone string de até 40 caracteres, mensagem de 1 a 1.000 caracteres e corpo de até 8 KiB. Segredo interno continua obrigatório.
- Enfileiramento e ações legadas: corpo limitado a 64 KiB. Assistente: limite de 2 MiB, além dos limites de histórico e ferramentas existentes.
- Nova migração adiciona contadores persistentes e atômicos por conta, operação e janela. Quota esgotada responde 429 com Retry-After; consulta indisponível responde 503 antes da operação.
- Vite bloqueia chaves privilegiadas conhecidas e variáveis VITE_* com nomes de segredos. A chave Supabase do frontend precisa ser anon/publishable. Os erros não imprimem valores.
- Scanner Python sem dependências e seus testes foram adicionados ao workflow. O gitignore agora também protege arquivos de chaves privadas e backups.

| Rota | Por 10 minutos por conta | Por dia UTC por conta |
| --- | ---: | ---: |
| ai-assistant | 20 | 200 |
| daily-briefing | 10 | 100 |
| ai-database-actions | 60 | 1.000 |
| send-whatsapp | 30 | 1.000 |

São limites de solicitações, não de destinatários ou custo em reais. Cada conta/operação mantém somente dois registros, reutilizados nas novas janelas. Identidade e limites são definidos no banco; usuários comuns não podem ler ou modificar os contadores. O usuário compartilhado continua suportado.

O compositor atual também grava mensagens via PostgREST. A quota da rota send-whatsapp não cobre esse caminho; a fila continua usando seu controle de despacho existente. Centralizar todas as entradas em uma operação do servidor pertence à revisão arquitetural seguinte.

## Verificações na VM — somente leitura

- As 12 tabelas verificadas (alunos, avaliações, mensagens, automações, equipe, conversas/ações de IA e lease) têm RLS ativo e nenhum privilégio de tabela para anon.
- As seis RPCs internas de lease, claim, preparo, conclusão e recuperação da fila bloqueiam anon e authenticated.
- Cadastro público e autenticação anônima estão desativados no Auth de produção.
- Contêineres inspecionados ativos. Bindings publicados de PostgreSQL/pooler, gateways e Evolution restritos a 127.0.0.1. Isso não substitui uma varredura externa de todas as portas.
- Backup 20261014T060327Z: quatro arquivos conferem com o manifesto, os dois gzip passaram na verificação de compressão e a cópia local dos quatro arquivos confere por SHA-256 com a remota. Não foi executada nova restauração completa neste lote.

## Segredos e dependências

- Nenhum padrão de segredo privado encontrado na árvore examinada ou nos 1.290 blobs candidatos do histórico alcançável, em 791 commits.
- O scanner detecta formatos comuns de tokens, JWT Supabase privilegiado, cabeçalhos de chaves privadas e atribuições de segredos conhecidos. Não prova ausência de toda senha arbitrária nem examina os arquivos ignorados que não seriam versionados. Em caso de achado imprime somente caminho, linha e categoria.
- npm audit: zero vulnerabilidades conhecidas reportadas. Deno audit do lockfile: nenhuma vulnerabilidade conhecida reportada. Esses resultados dependem da cobertura das ferramentas e não certificam imagens da VM ou os binários da Evolution.
- Senhas e chaves compartilhadas em conversa não foram copiadas para este documento. Sua rotação deve ser coordenada, preservando o acesso do cliente.

## Validação

- Vitest: 175 testes em 25 arquivos passaram, incluindo RLS, ciclo da fila, quotas, configuração pública, limites HTTP e sanitização do provedor.
- Testes HTTP Deno cobrem autenticação, revogação, enfileiramento, quotas, entradas inválidas, envio avulso simulado e permissões de WhatsApp. Sem WhatsApp real ou chamadas pagas de IA.
- Cinco testes Python do scanner passaram.
- TypeScript da aplicação e do Vite, lint e build passaram.
- Deno check dos cinco handlers alterados passou. O ajuste também corrigiu a tipagem dos parâmetros legados e dos IDs de destinatários.
- Suíte HTTP final: dois testes principais e 14 passos passaram.

Banco nos testes: PGlite. Os handlers HTTP usam Deno real com Auth/PostgREST/Evolution simulados em loopback. A nova quota ainda precisa de homologação completa no Edge Runtime da VM antes da publicação.

## Implantação e retorno

1. Preservar o backup verificado e o conjunto atual dos handlers.
2. Validar em homologação a migração 20261014010000_staff_request_quotas.sql.
3. Aplicar a migração antes dos novos handlers. Sem a RPC nova, eles falham com 503 e não executam a operação.
4. Publicar módulos compartilhados e handlers do mesmo lote; conferir autorização, 429 e funcionamento normal sem disparos reais.
5. Publicar o frontend pelo workflow após os checks.

Para retorno, restaurar o conjunto anterior dos handlers. A tabela nova pode permanecer inativa; não é necessário apagar dados da academia ou reverter migrações antigas.

Controle de acesso, validação de entradas, métodos e respostas foram revisados usando o [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html). Este relatório registra os checks executados, sem garantir ausência de vulnerabilidades.
