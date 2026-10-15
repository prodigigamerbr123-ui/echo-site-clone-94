# Índice de evidências da auditoria

Estado consolidado e backlog: [handoff](../../handoff.md). Procedimentos: [runbook](../OPERATIONS-RUNBOOK.md). Este índice privilegia entregas atuais; relatórios anteriores permanecem como histórico, não como prova da versão hoje publicada.

| Área | Evidência de referência | Alcance e limite |
| --- | --- | --- |
| Acesso do dono | [15/10: senha e logout global](senha-proprietario-2026-10-15.md) | Novo login/dashboard aprovados; sete sessões removidas e refresh recusado. JWTs expiram no prazo próprio. |
| Administração | [15/10: Studio/Meta sob demanda](admin-sob-demanda-2026-10-15.md) | Dois serviços desligados por padrão; dez verificações isoladas e 20 de produção repetidas. Imagens não corrigidas por esse lote. |
| Básico/configurações | [15/10: escopo e confiabilidade](configuracoes-basico-2026-10-15.md) | cc2eaa6 publicado; 328 testes e assets conferidos. |
| Backup WhatsApp | [15/10: bancos/configuração Evolution](backup-evolution-2026-10-15.md) | Snapshot final copiado, três bancos restaurados; núcleo Workout repetiu 39 checks. Sem conexão duplicada ao provedor. |
| Qualidade/frontend | [15/10: tipos, limpeza e agenda](qualidade-frontend-2026-10-15.md) | b981426 publicado, 322 testes; entrada e agenda conferidas em produção. |
| Permissões | [15/10: matriz e catálogo](permissoes-2026-10-15.md) | 15 tabelas com RLS; limites e testes por área. |
| Borda/operação | [15/10: cabeçalhos e automação](borda-operacao-2026-10-15.md) | Cabeçalhos publicados; TLS, negativas, CORS e segundo ciclo diário conferidos. |
| Recuperação | [15/10: núcleo integrado](recuperacao-integrada-2026-10-15.md) | 39 verificações; host vazio e provedores externos pendentes. |
| Auth/backups | [15/10: Auth security1](auth-seguranca-2026-10-15.md) | Imagem publicada; achado residual de versão documentado; cache Deno ampliado posteriormente no relatório de recuperação. |
| REST | [14/10: PostgREST security1](postgrest-seguranca-2026-10-14.md) | Runtime publicado; zero críticos/altos na varredura registrada. |
| Pooler/permissões | [14/10: contas limitadas](pooler-permissoes-2026-10-14.md) | Configuração posterior à publicação da imagem. |
| Pooler/runtime | [14/10: publicação](pooler-publicacao-2026-10-14.md) | Imagem publicada com achados residuais; ver permissões acima. |
| Storage | [14/10: security2](storage-seguranca-2026-10-14.md) | Publicado; zero críticos/altos na varredura registrada. |
| Inventário geral | [14/10: containers](runtime-seguranca-2026-10-14.md) | Fotografia anterior às entregas individuais; usar seus relatórios para os serviços atualizados. |
| Agenda/histórico | [14/10: publicação 892bb88](agenda-publicacao-2026-10-14.md) | 306 testes na época; fluxos integrados e leitura de produção. |
| Operação natural | [14/10: automação diária](conferencia-operacional-2026-10-14.md) | Execução sem candidatos; não prova envio com candidatos ou estabilidade prolongada. |
| WhatsApp/gateways | [13/10: Evolution](evolution-seguranca2-2026-10-13.md), [gateways](gateways-seguranca-2026-10-13.md) | Consultar riscos e limites de licença registrados; não repetir mensagens automaticamente. |

## Como acrescentar evidência

Registrar data, commit, ambiente, comando/procedimento, resultado, backup e caminho de retorno. Distinguir implementação local, teste isolado, publicação e confirmação posterior. Nunca anexar dumps, tokens, logs com dados pessoais ou configurações privadas. Hashes e resumos sanitizados são suficientes para apontar artefatos privados.

Rotina técnica proposta e triagem de riscos: [manutenção de segurança](../SECURITY-MAINTENANCE.md). Responsável nominal e monitoramento externo ainda precisam ser definidos.
