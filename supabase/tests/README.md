# Testes HTTP de permissões

Esta suíte executa os handlers reais em processos Deno e faz requisições HTTP reais usando o cliente Supabase das funções. Os serviços upstream de Auth/PostgREST/Evolution são fixtures locais, com usuários e tokens fictícios. Não carrega arquivos .env.

Executar na raiz do projeto:

```powershell
$env:DENO_TLS_CA_STORE = 'system'
npx --yes deno cache --no-check supabase/functions/send-whatsapp/index.ts supabase/functions/send-oneshot/index.ts supabase/functions/ai-database-actions/index.ts supabase/functions/daily-briefing/index.ts supabase/functions/ai-assistant/index.ts supabase/functions/whatsapp-status/index.ts supabase/functions/whatsapp-diagnostic/index.ts supabase/functions/whatsapp-contacts/index.ts
npx --yes deno test --allow-run --allow-env --allow-net=127.0.0.1:18081,127.0.0.1:8000 supabase/tests/staff-http.test.ts
```

O bootstrap e import map usados somente pelos testes limitam o listener ao endereço 127.0.0.1. Os processos das funções usam ambiente próprio, cache de imports já preparado, leitura apenas de supabase/functions e supabase/tests, e rede limitada às duas portas locais. São encerrados ao terminar cada cenário. As portas 8000 e 18081 precisam estar livres.

Cobertura: ausência/invalidade de login, login sem vínculo, restrição de avaliador, revogação entre chamadas, indisponibilidade de consulta de papel, resolução dos destinatários cadastrados, enfileiramento, RPC de conclusão de avaliação, confirmação booleana estrita, payloads inválidos, status e QR do WhatsApp e bloqueio de logout indevido.

Limites: não verifica assinatura JWT contra Auth real nem RLS via PostgREST real; esses serviços são simulados. As permissões SQL são cobertas por src/test/staff-authorization.test.ts e pela validação da migração no PostgreSQL restaurado. Não testa envio efetivo, geração paga de IA ou a distribuição Edge Runtime da VM. Não substituir o teste final com frontend e serviços completos em staging por esta suíte.


## Validações adicionais de segurança

O envio avulso é exercitado somente contra a Evolution simulada. A suíte verifica segredo de cron, métodos, entradas inválidas, limites do corpo e remoção dos dados brutos do provedor. As rotas de IA e envio também são exercitadas com quota esgotada/indisponível; nesses cenários não podem consultar dados nem chamar o provedor.

A aplicação da quota em SQL, isolamento por conta/operação, reinício das janelas e proteção contra alterações dos contadores são cobertos em src/test/staff-authorization.test.ts com a migração de 14/10/2026. Isso complementa a simulação HTTP da RPC.
