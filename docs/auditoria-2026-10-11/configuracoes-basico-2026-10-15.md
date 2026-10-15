# Configurações e escopo básico — 15/10/2026

## Decisão de escopo

Cliente definiu sistema interno de academia pequena, com o básico bem feito. Critérios em [escopo](../ESCOPO-ACADEMIA-PEQUENA.md). A matriz histórica permanece disponível, mas recursos futuros não são requisitos automáticos para encerrar esta entrega.

## Falhas corrigidas

- Falha de consulta das notificações podia deixar a página em “Carregando…” indefinidamente. Agora há erro explícito, botão para tentar novamente e bloqueio de edição de dados antigos após falha de atualização.
- Ações rápidas podiam disputar o documento de configurações, pois cada alteração lê/mescla/salva o objeto completo. Mutations agora compartilham fila serial dentro do mesmo QueryClient; uma trava síncrona impede cliques duplicados da tela antes de renderizar o estado pendente. Isso não implementa controle transacional entre computadores distintos.
- Controles e ações em lote ficam desabilitados durante salvamento, com estado visível. Intervalo volta ao valor persistido se o salvamento falhar; não permanece com aparência de ter sido salvo.
- Switches receberam rótulos associados. Textos agora distinguem falha de envio e aceitação pelo provedor de confirmação de entrega ao destinatário.

## Verificação

Node 22: **328 testes em 41 arquivos**, tipos estritos, lint, alcance e build aprovados. Seis cenários novos cobrem falha/repetição da consulta, dados antigos após erro, controles durante escrita, clique duplicado, falha do intervalo e serialização entre instâncias do hook. Sem envio real, alteração de aluno ou requisição paga de IA.

Backup pré-publicação `20261015T173220Z`: cinco arquivos copiados para o computador e SHA256 conferidos. Publicação ainda deve ser confirmada pelo workflow/versão servida antes de registrar conclusão. Não requer migração ou deploy de funções. Retorno: republicar o frontend anterior b981426; não restaurar banco para desfazer a tela.

## Próxima prioridade básica de backup

Leitura da VM confirmou persistência da Evolution em PostgreSQL; seu volume dbdata estava vazio no instante da conferência. Não houve alteração de banco, conta ou conexão. O backup diário ampliado do Workout cobre os cinco arquivos do Supabase, mas a imagem preservada da Evolution não substitui backup dos seus bancos/configuração. Cobrir e restaurar esses dados isoladamente é uma pendência real de recuperação, anterior a melhorias de produto.
