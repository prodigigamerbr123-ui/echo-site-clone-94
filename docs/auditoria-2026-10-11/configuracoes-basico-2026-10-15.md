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

Backup pré-publicação `20261015T173220Z`: cinco arquivos copiados para o computador e SHA256 conferidos. Publicado em `cc2eaa65b4e232fed7b5e47f4d8a4e3482e0086f`, [workflow 38778303244](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38778303244) aprovado. Entrada `index-DJ6ac86l.js` e configurações `Configuracoes-B9d3P9jH.js` servidas em produção coincidem com o build local. SHA256 de configurações: `73606261a77be0e55bce9a9c6e1a9f500563313f367a4e939fda373f794998f2`. Não requer migração ou deploy de funções. Retorno: republicar o frontend anterior b981426; não restaurar banco para desfazer a tela.

## Próxima prioridade básica de backup

Leitura da VM confirmou persistência da Evolution em PostgreSQL; seu volume dbdata estava vazio no instante da conferência. A lacuna foi corrigida em continuidade: [backup e recuperação da Evolution](backup-evolution-2026-10-15.md). Três bancos/configuração incorporados ao runtime.tar.gz do snapshot final, copiados ao computador e restaurados isoladamente; primeiro ciclo automático e recuperação com reconexão do provedor continuam sem prova.
