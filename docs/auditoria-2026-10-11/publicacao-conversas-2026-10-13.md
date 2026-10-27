# Conversas da IA publicadas — 13/10/2026

- Commit local/remoto: `7c325ecd9bcb9d75f82ca0aba33071cd6c99305f`.
- Árvore conferida: `ff2b813e8fe0ba39f2f7edeebd0deea385752b18`.
- [Actions 38449996863](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38449996863): tipos, lint, 132 testes, build e deploy aprovados.
- Release da VM: `/opt/workout-releases/20261013-chat`, fase `resumed`.
- Preparação às 15:46:14 e tarefas reativadas às 15:48:58 de Brasília. Banco/backend atualizados antes da interface.
- Migração `20261013030000_durable_ai_chat.sql` registrada. Runtimes conferidos por hash; permissões privadas mantidas.

## Backup

Snapshot `20261013T184614Z`, copiado para `C:/Users/pejon/.codex/ssh-workout04/backups/20261013T184614Z`.

- `database.dump`: `f2d745fb06e89d7443875871d7460a7112abf6950817aae64f414ade7513bdf3`.
- `runtime.tar.gz`: `a1a79166263219ca1b31aac3d84cb700d3660e8e1dcf8a4ca2766b2b057f36ee`.
- Hashes locais iguais aos da VM. Catálogo legível por `pg_restore --list`, incluindo `ai_messages`. Não foi restaurado o banco de produção.

## Validação

- 30 verificações de produção aprovadas antes de reativar os jobs: runtime, migração, RLS, acesso anônimo negado, estado privado inacessível diretamente ao navegador, vínculo de respostas e contagens preservadas.
- Após a reativação: dois jobs ativos, Edge saudável, três alunos, um usuário, três conversas e 13 mensagens. Nenhuma nova execução diária foi fabricada.
- UI publicada carregou o histórico e habilitou o campo de mensagem, sem erros de console. A tela inicial foi conferida sem enviar perguntas nem criar registros; depois retornou à conversa mais recente.
- Layout publicado em tamanho de celular: lista recolhível disponível, largura do documento igual à viewport. Tamanho da janela restaurado após a conferência.
- Staging: 48 eventos de verificação, incluindo hashes e leituras repetidas. Provedor simulado dentro da rede interna: três chamadas locais; zero chamadas reais. Fixtures removidas, runtime restaurado e container de simulação removido.
- Conta visual removida após apagar somente suas conversas fictícias. O vínculo antigo de proprietário impede excluir um usuário que ainda possui conversas; esse comportamento foi preservado. Nenhuma conta ou conversa real foi apagada.

## Limites

- Cartões recuperáveis são das novas propostas vinculadas. Mensagens antigas continuam disponíveis; não foi inventado vínculo para propostas históricas que não tinham conversa associada.
- Não houve chamada paga à IA nem teste de envio real de WhatsApp neste lote. Geração e confirmações foram exercitadas com o provedor simulado.
- O aviso do motor continua esperado até a primeira execução diária natural. Jobs estão ativos; o histórico está vazio desde sua criação nesta data.
- Rollback deve coordenar interface e backend. Manter colunas e funções aditivas, preservando dados e os estados dos jobs; não restaurar um banco em uso.
- Próxima revisão: consistência das consultas e regras da IA com agenda, automações e cobranças.

![Chat publicado no celular](chat-publicado-mobile-2026-10-13.jpg)
