# Staging de permissões na VM

stage-security.py cria exclusivamente recursos com prefixo workout-stage-full-20261012 e arquivos em /opt/workout-stage-security-20261012. Não é um deploy de produção. Verifica se o banco temporário já existe e aborta em vez de sobrescrevê-lo.

Pré-requisitos: executar como root na VM existente; diretório temporário com modo 700; functions.tar.gz contendo supabase/functions como diretório functions; migration de permissões em staff.sql; backup 20261012T034915Z existente. Reutiliza imagens e cache de módulos da stack atual, sem copiar suas variáveis de ambiente. A inicialização usa mesmo PostgreSQL e restaura roles sem senhas, preservando ownership e atributos.

Depois da inicialização, verify-stage-security.py cria/reutiliza contas fictícias e substitui suas senhas exclusivamente na cópia, verifica Auth, REST/RLS e Edge Runtime, e salva validation.json. Os scripts geram segredos próprios de staging em arquivos com modo restrito; nunca imprimir credentials.json ou enviá-lo ao Git. Os testes escrevem fixtures e mensagens apenas na fila de staging.

O gateway fica em localhost:18090 na VM; o frontend de teste usa localhost:18091 via túnel SSH. Banco, Auth, REST e Edge ficam em rede interna. Somente o gateway possui uma segunda rede para publicação local. Não há Evolution/Gemini/SMTP ou jobs ativos; nenhuma mensagem é enviada por esses testes.

Ao finalizar, identificar os recursos exatamente pelo prefixo antes de pará-los. O PostgreSQL usa tmpfs: parar esse container descarta a cópia de testes. Não executar comandos genéricos contra todos os containers ou volumes. O backup original é independente deste ambiente.

Este staging cobre o caminho de login e autorização das funções e telas; Realtime, Storage e provedores externos permanecem fora do escopo desta stack temporária. A implantação deve manter migration, frontend e funções em versões compatíveis, com backup imediatamente anterior e plano de retorno revisado.

## Realtime e Storage

stage-add-services.py adiciona as mesmas versões de Realtime e Storage da produção ao banco de staging existente. Não copia senhas, chaves de criptografia, arquivos ou serviços externos de produção. Usa schemas/migrations próprios do serviço e schema storage do backup. Dados de arquivos novos são guardados em storage-files no diretório temporário.

verify-stage-services.mjs roda no computador usando o túnel SSH local existente. WORKOUT_STAGE_CONFIG deve apontar para o JSON restrito em .codex/ssh-workout04/stage-services.json, contendo apenas chaves e tokens emitidos pela stack de testes. O destino está fixado em http://127.0.0.1:18090. Tokens de fixture expiram: revalidar as contas pelo script de Auth e renovar o arquivo restrito quando necessário.

O teste usa um bucket privado e alunos fictícios identificados por UUIDs gerados nesta execução. Remove esses dados ao terminar e reativa o avaliador se o desativou para o teste de revogação. Nunca apontar esses scripts para a produção. A assinatura PostgreSQL deve estar pronta além da conexão do canal antes de inserir o evento de teste.
