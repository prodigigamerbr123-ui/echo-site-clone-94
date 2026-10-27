# Validação da migração de permissões — 12/10/2026

## Resultado

Acesso SSH disponível. Backup `20261012T034915Z` gerado pelo programa existente, copiado para `.codex/ssh-workout04/backups` no perfil local. Tamanhos conferidos e SHA-256 do database.dump idêntico entre VM e computador.

Container temporário `workout-stage-security-20261012-v2`: mesma imagem PostgreSQL 17.6 de produção, rede none, nenhuma porta publicada, memória limitada a 1536 MB e dados em tmpfs. Parado após a validação; os dados temporários não persistem após parar.

Restauração do archive dos schemas public, auth, extensions e supabase_migrations concluída com pg_restore --exit-on-error. Papéis copiados sem senhas, extensões pgcrypto/uuid-ossp e publicação supabase_realtime preparados. O usuário postgres do ambiente isolado permaneceu superusuário para a restauração. Não foram iniciados cron, worker, Edge Functions, Auth HTTP, Storage ou Realtime.

Migração 20261011030000_staff_authorization.sql aplicada e COMMIT confirmado na cópia. Verificacoes-staging.sql executado com ON_ERROR_STOP e terminou em STAGING_SECURITY_CHECKS_OK. Fixtures e ações de teste revertidas por ROLLBACK.

Verificados: bootstrap do administrador, autorização real de authenticated, criação/cancelamento transacionais pela RPC, bloqueio da RPC interna, bloqueio de escrita direta no status de avaliações e resumo do aluno, edição de notas permitida, usuário sem vínculo sem leitura de alunos e sem acesso à mutação de avaliações.

Produção consultada apenas para leitura/backup: staff_members ainda ausente. Nenhuma migração, publicação do frontend ou alteração de Edge Functions feita em produção.

## Antes da implantação

Validar os papéis recepcao/avaliador e os endpoints HTTP em staging com serviços completos, incluindo expiração/revogação do vínculo. Validar funcionalidades com o frontend e versão de funções que acompanham esta migração. Esta execução valida o banco, não representa um teste completo dos serviços.

Preparar backup imediatamente anterior e versões atuais do frontend/funções, publicar em janela controlada e aplicar migração pelo mesmo processo de registro de migrations do backend. Evitar implantar banco e frontend em versões incompatíveis.

## Retorno em caso de falha

A migração é transacional; qualquer falha antes de COMMIT deve reverter automaticamente. Depois de COMMIT, parar a implantação e evitar novas escritas se houver falha impeditiva. Restaurar o backup primeiro em outro PostgreSQL e conferir dados antes de substituir o banco ativo; restaurar também as versões correspondentes de frontend/funções. Uma restauração posterior ao backup descarta as alterações de dados feitas depois dele, portanto exige avaliar essas alterações. Não usar REVOKE/GRANT amplo como rollback improvisado.

## Revisão de integração local — 12/10/2026

Corrigidos em useAuth: limpeza do React Query na troca de conta e mudança/revogação de papel; reconsulta de permissões a cada 60 segundos, ao focar a janela e ao renovar token; descarte de respostas de sessões antigas; falha da consulta bloqueia o acesso. O banco e a API continuam responsáveis pela autorização de cada operação; o intervalo serve para atualizar a interface.

GlobalNotifier aguarda o papel autorizado antes de consultar configurações, descarta respostas assíncronas após desmontagem e zera contadores/cursor na limpeza. A ação legada update_student_evaluation da função ai-database-actions exige evaluation_id e usa complete_evaluation_tx; não aceita mais sobrescrever o resumo do aluno por data arbitrária.

Validação local: 56 testes em 7 suítes passaram, incluindo três novos testes de isolamento de sessão/revogação e onze de permissões SQL. TypeScript com tsconfig.app.json, build e git diff --check passaram. O build mantém avisos de bundle grande e Browserslist antigo.

Limitação: estas correções da função foram revisadas no código, sem execução HTTP em Edge Runtime. Continua pendente staging dos serviços completos e teste do fluxo de interface com API real. Nenhuma implantação feita nesta etapa.

## Execução HTTP isolada — 12/10/2026

Deno 2.9.6 disponível via npx. deno check passou nas sete funções alteradas: send-whatsapp, ai-database-actions, daily-briefing, ai-assistant, whatsapp-status, whatsapp-diagnostic e whatsapp-contacts.

Suíte supabase/tests/staff-http.test.ts passou com dez etapas HTTP. Executa handlers reais e cliente Supabase com Auth/PostgREST/Evolution simulados em loopback. Confirma 401 sem login/com token inválido, 403 sem vínculo/papel permitido, bloqueio após revogação e 503 quando a consulta do papel fica indisponível. Confirma que enfileiramento usa nome e ID do cadastro, sem telefone do cliente; a ação de conclusão legada invoca a RPC; consulta de status permite equipe, QR permite apenas admin e logout de avaliador é bloqueado antes de acessar o provedor.

Encontrada e corrigida confirmação permissiva na função legada de IA: strings e números eram aceitos por truthiness. Agora exige userConfirmation === true; payload nulo/parâmetros inválidos retornam 400. Casos cobertos na suíte HTTP, sem escrita para confirmação inválida.

A validação HTTP é executada em Deno local com fixtures; não significa que Auth, PostgREST, Edge Runtime e frontend foram validados juntos em uma cópia completa da stack. Staging com serviços completos ainda pendente. Sem deploy ou alterações no banco ativo.

## Staging com serviços reais e interface — 12/10/2026

Criada stack temporária workout-stage-full-20261012 com as mesmas imagens de PostgreSQL 17.6, Auth v2.196.0, PostgREST v14.17 e Edge Runtime v1.76.2 da produção. Banco inicializado com bootstrap separado: o papel postgres restaurado mantém os atributos de produção, inclusive NOSUPERUSER. Memberships foram recriadas com grantor de staging, sem copiar senhas de roles. Schemas public/auth/extensions/supabase_migrations restaurados do backup; permissões USAGE de schema auth foram comparadas com produção e repostas explicitamente na cópia.

Rede interna para banco/Auth/REST/Edge; somente gateway nginx também participa de rede de acesso para permitir publicação em 127.0.0.1:18090. Gateway oferece exclusivamente rotas fixas de Auth, REST e funções. CORS permitido apenas para frontend local 127.0.0.1:18091, incluindo content-profile/accept-profile. Acesso do computador por túnel SSH. Sem túnel público de staging, sem crons/worker ativo, sem chaves de Evolution/Gemini/SMTP de produção. Nomes/telefones/CPF de alunos e textos de mensagens/conversas foram substituídos por fixtures na cópia. Isso não é anonimização completa de todos os dados do archive original.

verify-stage-security.py passou em 55 verificações com Auth real, JWTs emitidos por ele, PostgREST/RLS e funções no Edge Runtime real. Cobertura inclui admin/recepção/avaliador/login sem vínculo, criação de aluno na recepção, bloqueio de cadastro por avaliador, criação/cancelamento/conclusão de avaliação pela RPC, atualização de observações, proibição de atualização direta de status, resumo do aluno derivado da conclusão, acesso às sete funções, fila com nome resolvido no banco, confirmação estrita e revogação com o mesmo token.

Na interface local, confirmado login de admin, lista de alunos com as ações correspondentes, logout e login de avaliador, lista sem editar/excluir/enviar, bloqueio da rota /mensagens e acesso à agenda. Encontrados atalhos de envio/IA no dashboard do avaliador: corrigidos QuickActions, Dashboard e StatsOverview para ocultar esses atalhos e métricas de mensagens inacessíveis. Evidência: dashboard-avaliador-staging.png.

Removido import antigo de XMLHttpRequest sem uso da função legada. As duas funções de IA passam a usar Deno.serve nativo, já usado pelo briefing e suportado pela versão de Edge Runtime em produção. Suíte HTTP local de dez etapas e deno check das funções de IA passaram novamente. TypeScript do frontend e build passaram; permanecem avisos anteriores de bundle/Browserslist. Produção recebeu somente consultas de leitura para comparação; nenhuma migration/função/frontend publicado nesta etapa.

Limites: Realtime, Storage, recuperação de senha por SMTP, geração de IA paga e entrega real no WhatsApp não são validados por esta stack de quatro serviços. As contas de teste/segredos exclusivos de staging ficam em arquivo restrito na VM; o computador conserva somente configuração temporária de interface em .codex/ssh-workout04. Dados do PostgreSQL temporário estão em tmpfs e desaparecem ao parar seu container. Preservar o backup original antes de encerrar; não usar este ambiente como cópia durável.

## Realtime, Storage e provedores — 12/10/2026

Staging ampliado com as mesmas imagens de Realtime v2.134.10 e Storage API v1.74.0 da produção. Os dois serviços ficam na rede interna, com senha/JWT/chave de criptografia de staging. Storage usa diretório próprio, sem montar arquivos de produção; a transformação de imagens não foi habilitada. Gateway publica somente rotas locais /realtime/v1/ e /storage/v1/.

verify-stage-services.mjs passou em quinze verificações reais: criação de bucket privado, upload e download pelo serviço autorizado, bloqueio de download para admin/usuário sem vínculo sem política de Storage, assinatura de canais, confirmação da assinatura PostgreSQL pronta, entrega de evento de aluno a admin e avaliador, ausência de entrega ao usuário sem vínculo, revogação do avaliador com conexão aberta, entrega do evento posterior somente ao administrador. As fixtures de alunos, objeto e bucket são removidas ao terminar; o vínculo do avaliador é reativado na cópia. Resultado sem dados pessoais em validacao-realtime-storage.json.

A primeira tentativa de Realtime conectou o canal antes da preparação da assinatura PostgreSQL e perdeu o evento inserido cedo. O teste passou a aguardar explicitamente o evento de sistema postgres_changes/status ok antes de produzir a fixture. Conexão WebSocket por si só não comprova que a assinatura de banco está pronta.

Consultas somente de leitura nos provedores de produção: Evolution /instance/status respondeu HTTP 200 com conexão/login ativos; Gemini GET do modelo configurado respondeu HTTP 200. Nenhum envio, pareamento, logout, geração de texto ou chamada paga de chat foi executado nessa conferência. Isso demonstra disponibilidade/configuração, sem comprovar entrega de WhatsApp ou geração de texto nesta rodada.

As quinze verificações de Realtime/Storage complementam as 55 anteriores com Auth/PostgREST/Edge Runtime. Resultado disponível para preparar a publicação coordenada da migration, frontend e funções. Produção ainda sem aplicação da migration de permissões e sem publicação destas mudanças.

## Decisão do cliente e teste de envio — 12/10/2026

Cliente confirmou que usará somente um usuário/senha neste momento. Manter somente a conta administrativa existente em produção; não provisionar recepção/avaliador nem acrescentar gestão de equipe nesta publicação. Papéis adicionais foram usados apenas como fixtures de testes de isolamento. As verificações internas de acesso continuam protegendo a conta atual.

Backup novo 20261012T183225Z criado e copiado ao computador. Schemas da aplicação e Auth restaurados em banco independente workout_backup_check_20261012 dentro da stack temporária: 3 alunos, 1 usuário de Auth, migration 20261011020000 e ausência da migration nova de staff, como esperado. pg_restore --exit-on-error concluiu. Este ensaio valida aplicação/Auth; não constitui ensaio completo de restauração de todo o runtime/volumes/configuração externa.

verify-stage-whatsapp.py passou em sete verificações: cancelamento não enviado, um único envio com dois workers simultâneos, item marcado sent, um único registro de histórico com ID do provedor e nova execução sem duplicata. Provedor Evolution aceitou exatamente uma requisição para o número de teste anteriormente autorizado. Confirmação de recebimento no aparelho foi solicitada ao cliente; aceite do provedor não equivale a confirmação de entrega.

Proxy temporário restringiu destinatário e texto, reservou atomicamente a única tentativa em arquivo persistente e bloqueia uma nova execução do teste após essa tentativa. Credencial de Evolution usada só no proxy temporário; container/arquivo foram removidos e o ambiente original do Edge de staging reposto no finally. Filas restauradas antigas foram canceladas exclusivamente na cópia antes da ativação. Nenhuma fila/cadastro/configuração do banco de produção foi alterado. O número de teste permanece somente na configuração privada de staging, fora dos arquivos de código publicados.

IA: revisão do caminho confirmado encontrou a pendência S04 ainda aberta. Frontend envia tool/args sem identificar uma confirmação persistida; agendamento de mensagem insere UUIDs novos a cada chamada. Repetir a confirmação pode gerar agendamentos repetidos, e erro ao sintetizar a resposta depois da escrita pode parecer falha da operação. Correção de confirmação booleana da função legada não resolve a idempotência do assistente principal. Antes da publicação, persistir proposta/autor/validade, consumir ID de confirmação uma só vez e separar resultado da ação da disponibilidade do modelo. Não foi declarado aprovado o teste de ação de IA sem duplicatas.

## Correção das confirmações do assistente principal — 12/10/2026

Nova migration local/staging 20261012010000_persist_ai_confirmations.sql adiciona armazenamento privado de propostas com autor, validade e estado. Somente o serviço pode criar/consumir/finalizar; usuários do navegador não acessam a tabela ou esses RPCs diretamente. Claim verifica autor ativo e consome atomicamente pending -> executing. Repetições retornam o estado/resultado e não executam outra escrita. Estados executing/failed não voltam automaticamente a pending: falhas incertas exigem conferência dos dados.

AIChat confirma apenas o ID da proposta salva. O backend ignora tool/args fornecidos na confirmação e usa a proposta do servidor; valida histórico e limites. Resultado estruturado é registrado antes de pedir síntese ao modelo; falta/erro do modelo não converte escrita concluída em uma operação a repetir. Síntese tem timeout de 15s e chamadas de conversa de 45s.

Testes: 58 testes locais passaram, incluindo consumo único/cache, autoria, validade e bloqueio de chamada direta. TypeScript, build, deno check e dez etapas HTTP passaram. Na stack real de staging, sete verificações de IA passaram: confirmação concorrente fez uma única escrita, repetição retornou resultado salvo, argumentos forjados na confirmação não alteraram a ação, ID ausente e autor diferente foram bloqueados. A síntese estava sem chave em staging; a operação ainda retornou seu resultado. Fixtures da fila foram canceladas na cópia.

O teste de conversa real revelou HTTP 404 para gemini-2.5-flash: a resposta do Google disse que o modelo não estava disponível para novos usuários desta chave. gemini-3.8-flash, indicado pelo provedor, teve timeout/HTTP 503 nesta rodada. gemini-3.6-flash respondeu HTTP 200 com conteúdo a um prompt sintético curto, sem dados da academia. O fallback do helper local foi atualizado para gemini-3.6-flash. A variável GEMINI_MODEL da VM de produção ainda precisa ser atualizada na publicação coordenada; o override atual mantém o modelo antigo mesmo após mudar o fallback.

Referências oficiais consultadas: https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash e https://ai.google.dev/gemini-api/docs/openai. Não confundir teste de listagem de modelos com geração funcionando.

## Confirmação de recebimento — 12/10/2026

O cliente confirmou que recebeu uma única mensagem do teste de fila em seu WhatsApp. Esta confirmação complementa o aceite do provedor, o único registro de histórico e o teste sem duplicatas entre workers. Nenhum envio adicional foi realizado após a confirmação.


## Publicação concluída — 12/10/2026

Autorização do cliente: “bora la entao”. Publicado commit fe02bcf33b4f58a263b1a97b8442bec2fa2f9f3a em main pelo conector GitHub existente. Workflow 38294943504 concluiu success: https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38294943504.

Antes da troca: jobs 1/2 pausados, nenhum item processing, gateway em manutenção. Backup novo 20261012T190039Z gerado, copiado ao computador, hash SHA-256 de database.dump comparado e idêntico. O runtime archive foi ajustado para conter public-gateway.conf anterior à manutenção; os jobs anteriormente ativos estão registrados no state.json privado da release para recuperação.

Aplicadas e registradas 20261011030000_staff_authorization e 20261012010000_persist_ai_confirmations como postgres, preservando ownership das funções. Atualizados os arquivos das funções/helper, mantendo main/import map/configuração privada. GEMINI_MODEL alterado para gemini-3.6-flash. Publicação coordenada do frontend via workflow existente, no domínio atual.

Conferências de produção: login HTTP 200 com a conta existente; current_staff_role retornou admin; 3 alunos legíveis para a conta; acesso anônimo bloqueado HTTP 401; WhatsApp HTTP 200/open/connected; IA HTTP 200 com resposta e sem proposta de ação ao prompt sintético. Permanece 1 usuário em auth.users e 1 administrador ativo, sem provisionar equipe. Nenhuma senha alterada.

Após sucesso do workflow: restaurado gateway original e reativados exatamente os jobs 1/2 anteriormente ativos. Auth health público HTTP 200 com a chave pública normal da aplicação. Assets publicados mudaram para index-C2Xs4LQg.js/index-Cq1nRLmV.css. Conferido no navegador o carregamento da versão nova com sessão atual, a agenda e o WhatsApp conectado. Evidência: whatsapp-publicado-2026-10-12.png. Nenhum envio adicional provocado durante esta publicação.

Registro de operação em /opt/workout-releases/20261012-permissions na VM e publicacao-2026-10-12.json local. Checkout local sincronizado ao commit publicado preservando documentos/scripts locais não publicados. Os ensaios anteriores de staging e seus limites continuam documentados; conferências de produção não demonstram ausência de todo bug futuro nem entrega exatamente uma vez sob todas as falhas possíveis.
