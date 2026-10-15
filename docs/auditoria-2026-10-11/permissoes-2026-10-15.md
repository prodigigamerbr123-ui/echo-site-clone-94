# Matriz de permissões — conferência de 15/10/2026

## Evidência atual

Consulta de catálogos em produção, dentro de transação READ ONLY; nenhum grant, usuário, política ou dado foi alterado. Captura sanitizada privada `C:/Users/pejon/.codex/ssh-workout04/permissions-20261015/catalog.json`, SHA256 `3ee7d2ebb43595c032315b439e8e9012e4d618dec06da1134baeed99d0d50223`.

- **15 tabelas públicas**, todas com RLS. `anon` sem SELECT/INSERT/UPDATE/DELETE em todas elas.
- Tabelas internas `whatsapp_delivery_lease`, `staff_request_quotas`, `ai_pending_actions` e `message_enqueue_requests` também sem SELECT direto para `authenticated`.
- **31 funções públicas** inventariadas. Operações de worker/lease/claim/finish e confirmação interna da IA não têm EXECUTE para anon ou authenticated; service role mantém os acessos esperados.
- `storage.objects` e `storage.buckets` com RLS; zero buckets/objetos no instante da leitura.
- Sete funções têm EXECUTE para anon: seis funções de trigger e `message_automation_key(text)`, helper imutável que traduz nomes de automação sem consultar dados. A presença desse privilégio não equivale a acesso às tabelas. Revisão futura pode remover grants desnecessários; esta conferência não alterou triggers ou contratos.

## Matriz de acesso e provas disponíveis

| Recurso | Anônimo | Perfil autorizado | Backend técnico | Evidência/limite |
| --- | --- | --- | --- | --- |
| Alunos, avaliações, mensagens e configurações | Sem privilégios de tabela; REST 401 | Grants sujeitos a RLS e papel de staff | Serviços conforme operação | `staff-authorization.test.ts`, negativas REST externas; não depende de contas individuais como requisito do cliente. |
| Dashboard | RPC sem EXECUTE | RPC com EXECUTE, sem SECURITY DEFINER | Sem EXECUTE direto para service role | Catálogo + testes de autorização e consulta; backend usa contexto autorizado. |
| Histórico/conversas IA | Sem RPC/tabelas | Operações com identidade/posse | Claims/finish internos exclusivos | `ai-conversations`, `ai-message-history`, `ai-contracts`; chamadas pagas não executadas. |
| Agenda e enfileiramento | Sem EXECUTE | RPCs com autorização/validações | Versões internas restritas | `evaluation-*`, `message-enqueue-database`, `delivery-database`; transações e negativas em PGlite/homologação. |
| Worker e lease WhatsApp | Sem EXECUTE | Sem EXECUTE | service role | Catálogo confirma restrições; testes sem envio real. |
| Storage privado | RLS ativo | Depende de bucket/política | Credencial administrativa protegida | Restore integrado provou upload/download privado com fixtures; base original vazia. Não prova políticas para anexos futuros. |
| Pooler | Sem acesso público de dados pelo gateway | Não é o caminho do navegador | Contas técnicas limitadas | Relatório `pooler-permissoes-2026-10-14.md`; não reutilizar senha administrativa nas contas de runtime. |

## Limites para encerramento

Grants e RLS ativos são necessários, mas não provam isoladamente o conteúdo de todas as políticas, segurança de todos os corpos SECURITY DEFINER ou ausência de caminhos alternativos. A suíte atual tem 322 testes; nem todos são testes de autorização. Não afirmar 322 negativas de segurança.

Manter este inventário junto dos testes comportamentais e revalidar após novas tabelas, funções, bucket ou papel. Rotação das credenciais compartilhadas no histórico continua pendente; catálogo correto não revoga uma credencial conhecida por terceiros.
