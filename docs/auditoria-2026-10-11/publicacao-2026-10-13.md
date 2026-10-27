# Publicação — 13/10/2026

Publicado commit c62f87c40b6d105b683f9aa32a31dda464ea2658.
Workflow 38420634682 concluído com success:
https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38420634682

A árvore remota 7d77f0cc0e784ffb53ec622b60808c1b1d70dd4e é idêntica à
árvore local validada. Checkout sincronizado à publicação preservando
arquivos locais não publicados. O workflow agora exige testes isolados
e TypeScript antes de construir/publicar o site.

Backup imediatamente anterior: 20261013T151350Z, copiado ao computador
em .codex/ssh-workout04/backups. Catálogo pg_restore validado pelo script
de backup; tamanhos e hashes comparados com a VM:

- database.dump: dc9929cc3baa766a85e59a96f91564f1cfd8fb02a89edac770592974afeb32ce
- runtime.tar.gz: 6c09166bc7ff4cc357f028ca14a499305cae29d483f1b26bf1b7505d2acde72c

Jobs 1/2 pausados durante a troca; nenhum processing, lease ou pedido HTTP
pendente na preparação. Gateway temporariamente em manutenção.
A primeira tentativa SQL reverteu por permissão insuficiente para registrar
a migration. Corrigida a sessão: supabase_admin, SET LOCAL ROLE postgres
para criar a tabela, RESET ROLE para registrar a versão, tudo em uma
transação. Nenhuma política ampla adicionada.

Aplicada 20261013010000_automation_run_history e atualizados somente
daily-automation/index.ts, _shared/phone.ts e _shared/database.types.ts.
Preservados main, configuração e credenciais. Edge saudável após restart,
schema REST recarregado, gateway restaurado e jobs anteriormente ativos
reativados após aprovação das conferências.

Onze verificações passaram: versão registrada, índice de exclusão de
execuções, RLS, uma conta existente, três alunos existentes, jobs pausados
na validação, saúde Auth, acesso anônimo negado a alunos e histórico,
cron com segredo inválido recusado e nenhum histórico artificial criado.
Não foi disparado daily-automation com segredo válido para testar produção.
Não foi solicitado envio WhatsApp ou chat pago.

Navegador: sessão administrativa existente abriu a tela nova Automações,
contadores e alerta de primeira execução pendente visíveis. Nenhum
erro/aviso do console nessa tela. WhatsApp mostrou Conectado após a troca.
Entrada publicada observada: /assets/index-SR1sUFT5.js.
Evidência visual local: automacoes-publicadas-2026-10-13.jpg.

Histórico ainda vazio após a implantação: deve ser preenchido na primeira
execução natural do cron. O aviso inicial é esperado e não comprova falha.
Conferir o resultado dessa execução permanece pendente.

Registro operacional restrito na VM:
/opt/workout-releases/20261013-automations/state.json e validation.json.
Arquivos anteriores guardados em before/. Retorno de backend preserva a
tabela aditiva e não apaga histórico/fila nem restaura banco sobre dados
posteriores ao backup. Um retorno completo também deve manter frontend
compatível; avaliar o estado antes de agir.

Etapas de consultas, layout e desempenho publicadas. Permanecem a dívida
de tipos/lint, evolução da arquitetura, histórico com filtros/paginação no
servidor para volumes muito maiores e conferência da primeira execução
real do novo motor.
