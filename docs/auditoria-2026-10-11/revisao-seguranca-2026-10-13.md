# Revisão de segurança — 13/10/2026

## Evidências atuais

- `npm audit --json`: zero vulnerabilidades conhecidas nas dependências instaladas, incluindo desenvolvimento. Isso não cobre dependências remotas Deno nem imagens Docker.
- `npm run audit:security`: passou. Novo comando usa `npm audit --audit-level=high`; o workflow de publicação passa a executá-lo depois de `npm ci`. Falhas de consulta ao registro também impedem essa etapa.
- `vitest run src/test/staff-authorization.test.ts`: 28 testes passaram. Incluem RLS, permissões, isolamento de conversas, confirmação persistida e operações transacionais.
- Inspeção somente de leitura do banco em produção: 13 tabelas públicas com RLS ativado; 3 alunos, 1 usuário de autenticação e 2 tarefas cron ativas. Ter RLS ativado, isoladamente, não demonstra que toda política esteja correta.
- Requisições com a chave pública `anon`, sem sessão de usuário: leitura de `students`, `staff_members`, `ai_conversations` e chamadas de `ai-assistant` e `send-whatsapp` responderam HTTP 403. Os corpos das respostas não foram publicados. A chamada de envio foi recusada antes de processar o conteúdo.
- Busca nos arquivos atualmente versionados: nenhum padrão de chave privada PEM/OpenSSH, chave Google AI no formato AIza, token GitHub ou chave de acesso AWS encontrado. JWT identificado no arquivo de configuração do frontend tem papel `anon`. Não é uma varredura completa de segredos, do histórico Git ou da VM.

## Alterações locais

- Novo comando de auditoria de dependências e etapa correspondente no workflow. Ainda não publicados no GitHub nesta revisão.
- Restrição das regras de `.gitignore`: imagens e JSONs gerados na pasta de auditoria continuam locais; Markdown e SQL ficam visíveis para revisão. Caches Python continuam ignorados.
- Nenhum arquivo de auditoria foi apagado. Não houve alteração do runtime, banco, credenciais ou tarefas em produção.

## Pontos pendentes confirmados por leitura de código

1. `_shared/auth.ts` aceita `cron_secret` tanto no cabeçalho quanto na query string. URLs podem ser registradas por intermediários. A migração atual do cron já usa `x-cron-secret`; é necessário conferir todos os chamadores em execução antes de retirar a compatibilidade e publicar com verificação em staging.
2. `ai-database-actions` inclui `details` com a mensagem da exceção em respostas HTTP 500; `whatsapp-diagnostic` também retorna a mensagem da exceção. Esses endpoints exigem equipe autorizada, mas devem responder com mensagens públicas controladas e manter detalhes no servidor.
3. A validação por ação do endpoint legado `ai-database-actions` é menos completa que os contratos do assistente principal. O envio continua delegado ao endpoint protegido que coloca mensagens na fila. Conferir uso real antes de alinhar contratos ou desativar compatibilidade.
4. Dependências remotas Deno e imagens Docker ainda precisam de inventário e análise específicos nesta rodada. O resultado do npm não as cobre.

## Verificações operacionais ainda abertas

O histórico `automation_runs` continua sem registros. A primeira execução diária natural após a publicação do histórico é esperada em 14/10 às 08h de Brasília; não foi disparada manualmente. Nenhuma mensagem de WhatsApp ou chamada paga de IA foi realizada nesta revisão.

Os 142 erros de lint pertencem ao relatório antigo. A última execução disponível registra zero erros e 15 avisos de Fast Refresh, ainda sem refatoração nesta etapa.


## Publica��o das corre��es de endpoints

Conclu�da em 13/10/2026 em `/opt/workout-releases/20261013-security`, fase `resumed`.

- `auth.ts` aceita o segredo do cron somente por cabe�alho. Conferidos os dois comandos cron em produ��o: ambos usam `x-cron-secret`, nenhum usa `cron_secret=`.
- `ai-database-actions` e `whatsapp-diagnostic` respondem com erros p�blicos controlados; detalhes das exce��es continuam no log do servidor.
- Testes HTTP Deno: 2 testes e 10 etapas passaram, incluindo segredo ausente/incorreto/na URL, configura��o ausente, permiss�es e falha simulada de banco com resposta sanitizada.
- Staging isolado: 12 verifica��es passaram; fixtures removidas, contagens preservadas e runtime anterior restaurado. Depend�ncias auxiliares atuais foram inclu�das temporariamente para resolver m�dulos ausentes do staging.
- Backup anterior `20261013T220116Z` copiado para a m�quina local e hashes SHA256 conferidos independentemente:
  - database.dump: `21ad6464c80a8bedfeb99ef24c415c967059d5565b0a7d1e3f069769e52b7585`
  - runtime.tar.gz: `93b785eb3ec81758fbe309e072f6cf22438f9bd79252ef6e930a06864596a51d`
- Produ��o: hashes dos tr�s arquivos coincidem com o pacote; acessos an�nimos aos endpoints alterados e � automa��o retornam 403 no gateway. Essa verifica��o p�blica n�o substitui o teste autenticado realizado em staging.
- Preservados 3 alunos e 1 usu�rio. Nenhuma mensagem em processamento antes da retomada. Duas tarefas cron ativas ap�s a retomada.
- Tipos da aplica��o, lint dos arquivos alterados, sintaxe do script de publica��o e auditoria npm passaram. `git diff --check` passou ap�s normalizar finais de linha.
- Nenhum envio de teste ou chamada paga de IA. Sem migra��o de banco.

A valida��o por a��o do endpoint legado e invent�rio Docker/Deno continuam pendentes. A etapa de auditoria no workflow permanece local at� publica��o no GitHub.
