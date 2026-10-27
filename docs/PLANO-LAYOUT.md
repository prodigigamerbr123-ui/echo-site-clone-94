# Proposta de layout — Workout

## Objetivo

Facilitar a rotina do dono de uma academia pequena: identificar pendências, abrir a agenda, cadastrar alunos e preparar mensagens. Revisão de 15/10/2026, baseada no código atual e na conferência visual em homologação realizada no fechamento da auditoria. Esta é uma proposta para discussão; não altera o site publicado.

## Diagnóstico atual

- O dashboard apresenta dez atalhos antes dos números. No celular, esses cinco grupos empilhados atrasam o acesso ao resumo do dia.
- Há 16 cartões de indicadores para o perfil administrativo, com peso visual parecido.
- Gradientes e sombras em várias cores disputam atenção com o laranja da marca e com os alertas.
- O menu começa pela conexão WhatsApp, antes do painel e dos alunos.
- A área principal usa 24 px de margem interna mesmo no celular, reduzindo o espaço de formulários e cartões.
- Sugestões de IA ocupam uma seção extensa; ações operacionais precisam aparecer primeiro.

## Ordem proposta para o dashboard

1. **Hoje na academia:** título, data e acesso à situação do WhatsApp. Exibir estado real; falha de consulta deve permanecer visível.
2. **Ações principais:** cadastrar aluno, agendar avaliação e enviar mensagem.
3. **Quatro indicadores principais:** avaliações hoje, mensagens para hoje, mensalidades vencidas e alunos ativos.
4. **Precisa de atenção:** avaliações atrasadas, vencimentos e alunos sem avaliação, usando os dados existentes e acessos claros às telas correspondentes.
5. **Resumo detalhado:** demais números em grupos compactos ou expansíveis, preservando a consulta completa.
6. **Assistente IA:** área secundária e compacta, mantendo o acesso atual.

## Padrões visuais e navegação

Laranja para a ação principal e seleção; superfícies neutras; verde, amarelo e vermelho reservados a estados. Reduzir brilhos, sombras e efeitos de movimento. Manter temas claro/escuro e contraste legível.

Menu com Início e Alunos no começo; agrupar Avaliações e Mensagens; manter Automações, Assistente e Configurações acessíveis. Conexão WhatsApp terá acesso de status evidente, sem ocupar a primeira posição do menu.

No celular: margens menores, indicadores em duas colunas quando couberem, ações com texto claro, títulos sem truncar e áreas de toque adequadas. Preservar a rolagem dos diálogos corrigida na auditoria.

## Primeira entrega sugerida

Reorganizar dashboard, atalhos e menu; ajustar espaçamento responsivo e hierarquia de cores. Reutilizar componentes, permissões e dados existentes. Revisar a proposta antes da implementação. Critério: alcançar agenda, cadastro e mensagem pela primeira região útil do painel; conferir desktop/celular, estados de erro e navegação por teclado antes de publicar.
