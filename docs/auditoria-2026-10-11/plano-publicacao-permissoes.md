# Publicação coordenada das permissões — preparado em 12/10/2026

Status: publicação concluída em 12/10/2026, commit fe02bcf33b4f58a263b1a97b8442bec2fa2f9f3a; conferências registradas em publicacao-2026-10-12.json. Validado em staging com mesmos serviços/imagens da VM e frontend local. Conferências do banco/API: 55 verificações; Realtime/Storage: 15; suíte HTTP local: 10 etapas. Testes anteriores do projeto: 56. TypeScript/build passaram depois das últimas mudanças de interface.

## Escopo exato

Migration 20261011030000_staff_authorization.sql: vínculo profissional admin/recepcao/avaliador, RLS, proprietário das conversas, proteção de status da fila, bloqueio de alterações diretas da agenda/resumo do aluno e wrapper autorizado para RPCs transacionais.

Frontend: useAuth/ProtectedRoute, navegação por papel, alunos/templates, notificações e dashboard. Funções: helper de autorização e endpoints send-whatsapp, ai-assistant, ai-database-actions, daily-briefing, whatsapp-status, whatsapp-diagnostic, whatsapp-contacts; tipos compartilhados. As funções de IA usam Deno.serve nativo. Os scripts de staging/testes não são serviços da produção.

## Sequência

1. Registrar versões atuais e criar novo backup imediatamente antes da publicação; copiar/conferir archive e runtime no computador. O backup usado nos ensaios é 20261012T034915Z, não substitui este backup novo.
2. Manter somente a conta administrativa existente, conforme decisão do cliente. Não criar contas nem gestão de equipe. A migration inicializa exclusivamente admin@admin.com. Conferir owner de funções e schemas no banco ativo.
3. Preparar frontend pelo workflow existente de GitHub Pages com .github/workout-backend.env, VITE_PREVIEW_MODE=false e VITE_DEPLOY_TARGET=github-pages. Confirmar o PAGES_BASE_PATH configurado no GitHub. Não usar o bundle do dev server conectado ao staging.
4. Combinar janela curta de manutenção. Pausar os jobs da fila preservando sua configuração e aguardar despachos em andamento; bloquear escritas interativas enquanto migrações/funções/frontend estão sendo trocados. Registrar o estado de jobs antes de modificá-lo.
5. Aplicar migration com ON_ERROR_STOP por sessão administrativa e registrar sua versão pelo mecanismo já usado no backend. O arquivo possui BEGIN/COMMIT próprios. Abortar a publicação em qualquer erro.
6. Instalar a versão correspondente das funções e helper compartilhado, preservando main/deno.jsonc/variáveis privadas da stack. Publicar o frontend correspondente pelo workflow existente. Não trocar chaves de produção por chaves de staging.
7. Conferir login admin, current_staff_role, cadastro/edição de aluno, agenda e caixa de saída. Confirmar revogação/papéis sem usar dados reais como fixtures. Conferir Realtime e status do WhatsApp. Os testes finais de envio ou IA paga exigem destinatário/ação de teste definidos.
8. Restaurar apenas os jobs anteriormente ativos e encerrar manutenção quando as verificações passarem. Conferir fila/erros sem reenviar resultados incertos automaticamente.

## Retorno

Se a migration falhar antes do COMMIT, a transação deve reverter e a publicação é interrompida. Manter versões antigas até a falha ser resolvida.

Se houver falha após COMMIT, manter a janela de manutenção e conservar o backup novo e os dados posteriores. Restaurar primeiramente uma cópia isolada do backup/runtime anterior e conferir login/dados. Substituir produção somente com plano que preserve ou reconcilie escritas posteriores ao backup. Restaurar frontend/funções compatíveis com o banco escolhido. Não reabrir acesso genérico a authenticated como rollback improvisado e não apagar volumes ativos.

## Limites da validação

Evolution e Gemini responderam a consultas de disponibilidade de produção, sem envio/chat. Storage foi validado com bucket privado, sem imagem/transformação; o frontend atual não usa arquivos. Realtime foi validado com evento de aluno e revogação em conexão aberta. Nenhum ensaio promete entrega única do WhatsApp ou comprova ausência de toda vulnerabilidade do sistema.


Idempotência das confirmações de IA corrigida localmente e em staging pela migration 20261012010000_persist_ai_confirmations.sql. Incluir essa migration depois da migration de staff e publicar o AIChat/assistente correspondente juntos. Confirmar resposta estruturada/cache nas verificações finais. Atualizar GEMINI_MODEL da configuração da VM para gemini-3.6-flash, preservando a chave e o valor anterior no backup: o override atual gemini-2.5-flash retornou 404, enquanto 3.6 respondeu ao teste sintético. Essas atualizações foram aplicadas na publicação de 12/10/2026.



