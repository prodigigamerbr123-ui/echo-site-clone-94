# Índice de evidências da auditoria

Estado consolidado e backlog: [handoff](../../handoff.md). Procedimentos: [runbook](../OPERATIONS-RUNBOOK.md). Este índice privilegia entregas atuais; relatórios anteriores permanecem como histórico, não como prova da versão hoje publicada.

| Área | Evidência de referência | Alcance e limite |
| --- | --- | --- |
| Qualidade/frontend | [15/10: tipos, limpeza e agenda](qualidade-frontend-2026-10-15.md) | 322 testes; conferir seção de publicação antes de assumir entrega. |
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
