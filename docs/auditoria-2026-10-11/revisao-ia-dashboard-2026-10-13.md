# Alinhamento da consulta de IA com o dashboard — 13/10/2026

Publicado no backend da VM, release `20261013-ai-dashboard`. A ferramenta
`get_dashboard_stats` usa `get_workout_dashboard` com o cliente do usuário
autenticado e RLS, igual ao painel e ao briefing. Não houve migration ou
mudança visual neste lote.

Corrigidos: contagem de alunos sem avaliação limitada a quem tinha nascimento;
contagem de mensagens sem filtro de envios aceitos; aniversariantes calculados
a partir de uma lista REST possivelmente truncada; erros ignorados nas consultas.
O resultado inclui todas as métricas, dia de São Paulo, população de cada
indicador, limites das amostras e distinção entre aceite e entrega do provedor.
Pendências agendadas indicam explicitamente a janela das próximas 24 horas.

Cinco testes locais aprovados, TypeScript e lint dos arquivos alterados sem
erros. Treze verificações na VM de staging: contagens idênticas ao snapshot,
acesso anônimo negado, importação do assistente, remoção da conta fictícia e
contagens anteriores preservadas. Runtime de staging restaurado. Zero chamadas
a provedores reais e zero envios de WhatsApp neste lote.

Backup `20261013T211300Z`, copiado ao computador e hashes comparados:

- database.dump: `31e3060c297c1cd9b82ba5bff12ec2134e4592ec79dfc9242a2cf2438bbb1636`
- runtime.tar.gz: `29378567f83b2bb969e9a20b1153570417e601edd7390b9fa7d368fd8239636e`

Jobs pausados durante a troca; processamento, lease e requisições da fila
aguardados antes do backup. Edge saudável, gateway restaurado, dois jobs
reativados. Três alunos, uma conta e 13 mensagens de IA preservados. Hashes
dos dois arquivos publicados conferidos. Acesso público ao endpoint correto
do backend recusado com HTTP 403. A primeira conferência usou o domínio do
frontend por engano e foi repetida no domínio backend.workoutsaas.dpdns.org.

Este lote cobre a consulta de estatísticas. B12 continua parcialmente aberto:
agenda ainda usa prazo fixo de 90 dias para reavaliação; regras de conflitos,
outras listagens da IA e indicadores financeiros precisam da revisão restante.
Qualidade de resposta do modelo real não foi exercitada.
