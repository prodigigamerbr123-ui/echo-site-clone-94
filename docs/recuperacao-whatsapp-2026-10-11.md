# Recuperação da integração WhatsApp — 11/10/2026

## Diagnóstico confirmado

A função `whatsapp-status` recebia HTTP 401 da Evolution GO. Na VM, o PostgreSQL estava recusando novas conexões com `too many clients already` (limite de 100). Até a consulta administrativa às instâncias falhava por esse motivo.

Ao parar apenas a Evolution, as conexões foram liberadas. O token existente no gateway foi comparado ao cadastro da instância sem expor seu valor: ele era válido. Após reiniciar o serviço, a consulta voltou a HTTP 200 e a sessão salva reconectou. Nenhum token, senha ou vínculo de WhatsApp foi substituído.

## Correção implantada na VM

O caminho `StartClient` criava um novo pool de autenticação em cada retomada, sem fechar o anterior. Foi preparado um patch para reutilizar `authDB`, cujo limite já é de 25 conexões, por meio de `sqlstore.NewWithDB`. A atualização continua executando `Upgrade` como o caminho anterior. O código SQLite permanece igual.

Base: Evolution GO `9337afc47e10b86cc896a6f432240e40fee95dd1` (0.7.2). A compilação foi concluída na arquitetura ARM da VM. A imagem local implantada é `workout-evolution:0.7.2-pool25`, com digest `sha256:e8ed22400352063d8d134d70b388c4ce582c6464fc35a58706b2830770a6bba8`.

`CONNECT_ON_STARTUP=true` retoma as sessões salvas ao reiniciar. Volumes, credenciais, rede privada e porta vinculada a `127.0.0.1` foram preservados. O Nginx foi recarregado para resolver o novo container.

O container anterior foi preservado, parado e desconectado da rede, como `evolution-go-original-20261011`. Os bancos `evogo_auth` e `evogo_users` e a configuração original foram copiados na VM, com acesso restrito, antes da troca.

## Verificação

- Serviço: HTTP 200, `Connected=true`, `LoggedIn=true`.
- Banco: leitura após a implantação com 7 conexões no total, abaixo do limite de 100. Isso é uma observação pontual, não um teste de carga.
- Frontend: estado conectado confirmado. Erros de consulta usam estado desconhecido e aviso persistente; HTTP 401 não comprova que o token esteja errado, pois uma falha interna do provedor também pode causar essa resposta.
- Teste autorizado: uma mensagem passou pela fila normal, ficou `sent`, recebeu ID do provedor e gerou exatamente um registro no histórico, sem retry. A confirmação de recebimento no aparelho deve ser registrada separadamente.
- Worker reativado após a troca. Nenhuma mensagem de teste adicional foi criada.

## Reproduzir e manter

O patch e o Dockerfile estão em `ops/evolution-go/`. Faça checkout da base acima em uma pasta separada, aplique `shared-auth-pool.patch` e copie `Dockerfile.workout` para essa pasta. O contexto de build deve ser o repositório da Evolution, não o frontend deste projeto.

O Dockerfile utiliza a imagem anterior, etiquetada localmente como `workout-evolution-original:20261011`, para preservar bibliotecas e assets. Compile com `docker build -f Dockerfile.workout -t workout-evolution:0.7.2-pool25 .`. Preserve backups, variáveis, volumes e configuração da rede ao trocar o container. Não use `latest` para substituir a versão em produção sem revisar compatibilidade.

Em uma reversão: pause o worker, pare e isole o novo container, recoloque o anterior na mesma rede com nome/alias `evolution-go`, recarregue o Nginx e retome a sessão existente pela API de conexão. O anterior tinha reconexão automática desligada. Reativar apenas o container antigo pode deixar a sessão aguardando conexão e também retoma o caminho de pools que esta correção substituiu.

Não mantenha dois containers Evolution escrevendo simultaneamente nos volumes de sessão. Nunca registre tokens ou conteúdo dos backups no Git.
