# Dashboard e modelos publicados — 13/10/2026

- Commit local e remoto: `a355154a8d18e106c4398eb0f05bfd9f920c825d`.
- Árvore conferida localmente e no GitHub: `647025ca15639512e8ba6a902d1d6922cd197182`.
- [GitHub Actions 38441057606](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38441057606): tipos, lint, 116 testes, build e deploy aprovados.
- Release da VM: `/opt/workout-releases/20261013-dashboard`, fase `resumed`.
- Preparação: 14:41:30 de Brasília; backend conferido e tarefas reativadas às 14:43:07. Interface publicada após o backend.
- Migração aditiva `20261013020000_dashboard_snapshot.sql`, registrada na tabela de migrações. Consulta somente de leitura e sob RLS.

## Backup

Snapshot `20261013T174130Z`, copiado para `C:/Users/pejon/.codex/ssh-workout04/backups/20261013T174130Z`.

- Banco: SHA256 `8a9a1ac68dee55687ebc72f96f50206f535b6f00e0847b200315c377af54c984`.
- Runtime: SHA256 `d21de78b5b44c4d0d57cad43760ad3fe4a144c82ca2fdd126610bff152c29019`.
- Hashes locais iguais aos da VM; catálogo do dump legível por `pg_restore --list`, incluindo dados de alunos. Não foi feita restauração do banco de produção.

## Verificações

- 20 verificações de produção aprovadas antes de reativar os jobs: hashes de runtime, esquema, RLS, bloqueio anônimo, dados preservados e contagens do snapshot comparadas com consultas diretas ao banco.
- Após reativação: dois jobs ativos, Edge saudável, três alunos e um usuário. Nenhum novo registro de execução da automação diária.
- UI publicada: números carregaram, nova descrição de envio aceita pelo provedor e população de alunos ativos visíveis; sugestões com o novo título. Nenhum erro de console durante a conferência do dashboard.
- UI do WhatsApp: `Conectado`, mensagens podem ser enviadas normalmente. Nenhum teste de envio iniciado neste lote.
- Staging: 26 verificações; 1.005 alunos fictícios removidos, runtime e contagens anteriores restaurados. Conta visual descartável removida. Túnel e servidor local temporários encerrados.
- Dois testes Deno locais adicionais para cache de templates aprovados; checagem Deno dos consumidores aprovada.

## Limites e continuidade

- O aviso do motor é esperado enquanto não houver a primeira execução diária natural; não foi fabricado histórico nem disparado o cron de produção para removê-lo.
- Não foi exercitada a geração paga do briefing. Foram verificados o snapshot, o contrato e o contexto enviado ao modelo; a geração depende do provedor configurado.
- Mensagens já agendadas conservam o texto confirmado. Edições de templates afetam novas resoluções.
- O rollback de backend conserva a função aditiva de leitura, restaura os arquivos anteriores e os estados dos jobs. Não restaura nem apaga dados do banco em uso. A interface precisa de rollback próprio se necessário.
- Próxima revisão: fluxo e histórico de conversas do assistente de IA.

![Dashboard publicado](dashboard-publicado-2026-10-13.jpg)
