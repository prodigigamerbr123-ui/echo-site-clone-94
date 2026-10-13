# Prazo da agenda — 13/10/2026

Agenda consulta automation-settings com o mesmo cache da tela de automações e usa evaluation_invite.params.days_overdue. Padrão 90 somente quando o parâmetro está ausente, igual ao servidor; a tela de automações antes mostrava 30 sem valor salvo e foi corrigida. Valores inválidos são recusados. Habilitar/desabilitar envios não altera a necessidade clínica exibida na agenda.

A seleção usa alunos ativos, exclui compromissos futuros a partir do instante atual, limiar estrito de tempo decorrido para reavaliação e carência de 14 dias para nunca avaliados, igual à daily-automation. Os limites de tentativa, cooldown e mensagens pendentes são controles de envio, não critérios desta lista. A agenda não executa a automação nem escreve mensagens nesta consulta. Calendário geral e regras de criação de compromisso não foram alterados.

Erro ou carregamento de dados/regras não aparece como contagem zero ou lista vazia. Há aviso e botão de nova tentativa. Cartão renomeado Precisam de avaliação para distinguir alunos a avaliar de compromissos passados. Lista limitada a 20 é identificada e total do cartão permanece completo.

Validação: cinco testes de regra cobrindo prazo configurado, zero, fallback, entradas inválidas, fronteira estrita, carência e exclusões; tipos e lint. Teste visual com Auth/PostgREST reais no staging: aluno fictício avaliado há 40 dias aparece com 30 dias e desaparece com 90; null gera aviso; botão Tentar novamente recupera depois de corrigir configuração. Layout 390x844 sem overflow horizontal (clientWidth=scrollWidth=375). Fixture/conta removidas, params/estado anterior restaurados. Nenhuma mensagem ou chamada paga.

Publicação exclusivamente frontend via fluxo GitHub Pages. Nenhuma migration ou mudança de runtime/cron na VM. Retorno: versão anterior f3444a2d75ed0887c9b318214e0eb44261148a12. Backup disponível da publicação imediatamente anterior 20261013T213109Z, com hashes conferidos no registro de revisão do histórico.

Pendências: demais consultas limitadas da IA; primeira execução natural do histórico diário; validação do provedor real; calendário geral ainda contém usos do fuso local fora do cálculo de elegibilidade corrigido aqui.
