# Conversas e confirmações da IA — 13/10/2026

## Correções preparadas

- A adoção do ID da primeira conversa não remonta o chat nem substitui uma resposta em andamento. Trocas explícitas criam uma nova sessão; respostas atrasadas não atualizam outra conversa. Navegação, exclusão e decisões ficam bloqueadas durante operações locais ou salvamentos ainda não confirmados.
- Perguntas são salvas antes de chamar a IA. Falhas preservam o texto. IDs estáveis e `append_ai_message_tx` tornam o salvamento idempotente e atualizam a conversa na mesma transação. Recuperar um salvamento não gera uma nova chamada ao provedor.
- O backend persiste suas respostas antes de devolvê-las. Cada resposta está vinculada à pergunta ou ao cartão original. Uma resposta já salva pode ser recuperada pelo mesmo ID; reutilizar esse ID para outra pergunta é recusado.
- Em requisições com contexto durável, o histórico salvo no banco é a fonte do contexto do modelo. Todo o histórico continua visível; apenas as 40 mensagens recentes são enviadas ao modelo.
- Cartões de proposta são reconstruídos pelo servidor, com descrição e estado: pendente, em execução, concluído, falhou, cancelado, expirado ou bloqueado. HTTP 200 sozinho não significa que uma ação foi executada.
- Cancelamento muda o estado privado da proposta no servidor. Confirmar uma proposta cancelada não executa a operação. Repetir uma confirmação concluída não duplica o cadastro ou ação.
- A consulta de histórico usa uma função com acesso restrito ao próprio autor e aos papéis que já podem usar a IA. O navegador continua sem acesso direto ao registro privado de confirmações. Guardas impedem ligar mensagens/propostas/respostas entre conversas.
- Exclusão de conversa é bloqueada enquanto uma proposta vinculada está em execução. O claim trava primeiro a conversa para manter a ordem de locks.
- Lista de conversas tem paginação completa, ordenação estável e erro explícito. Preferência da conversa ativa é separada por identidade. No celular a lista abre em um painel recolhível; botões e estados têm nomes acessíveis.
- Erros brutos do provedor deixam de ser devolvidos ao navegador. Não há tentativa automática de repetir uma ação ou geração após erro de transporte.

## Evidência antes da publicação

- 132 testes Vitest aprovados em 15 arquivos, com casos de primeira resposta, salvamentos incertos, histórico atrasado, StrictMode, mais de 1.000 mensagens, confirmação, cancelamento, propriedade e vínculo entre pergunta/resposta.
- TypeScript, ESLint e checagem Deno aprovados. Lint sem erros; 15 avisos anteriores de organização dos exports.
- Fluxo completo exercitado na VM de staging: geração por provedor local simulado, proposta persistida antes da resposta, recuperação sem nova chamada, rejeição de ID reutilizado, cancelamento durável, execução única e falha HTTP 200 corretamente registrada como falha.
- Três chamadas ao provedor simulado; nenhuma ao provedor real. Nenhum envio de WhatsApp. Fixtures de alunos, conversas e contas removidas; contagens anteriores e arquivos de runtime restaurados; container simulado removido.
- Credenciais temporárias do staging venceram durante a verificação e foram renovadas com a mesma chave e validade de 24 horas. Edge/Storage isolados receberam os tokens atualizados; o banco de staging e a produção não foram reiniciados nesse ajuste. A rede permaneceu interna.
- UI conferida com cartões pendente/cancelado/falhou, sem erros de console. Em 390 × 844, a lista recolhível funcionou e a largura do documento não excedeu a viewport. Conta visual e conversas fictícias removidas; tamanho da janela restaurado e servidores locais encerrados.

## Compatibilidade e limites

- Texto das conversas antigas é preservado. Propostas antigas não tinham vínculo com conversas; não é possível reconstruir seus cartões sem inventar uma associação. Somente novas propostas vinculadas são recuperadas como cartões. Pré-leitura de produção: três conversas, 13 mensagens, nenhuma proposta não expirada ou em execução e nenhum papel de mensagem incompatível.
- A geração foi validada com um provedor simulado. Qualidade e disponibilidade do modelo real não foram exercitadas neste lote.
- Migração é aditiva. Em rollback, não remover dados nem restaurar um banco em uso; manter novas colunas/funções e reverter somente os runtimes/interface após pausar operações.
- Esta revisão cobre preparo e staging. A publicação terá registro separado com commit, backup e validações de produção.
