# Borda pública e operação — 15/10/2026

## Operação natural, sem disparos manuais

Leitura de produção em transação `READ ONLY`: automação de 15/10 às `11:00:00.104308Z` (08h de Brasília), término `11:00:00.166Z`, status `success`, sem erro. Dois alunos ativos, zero candidatos e zero inserções; limite 60, prazo 90 dias. A execução de 14/10 também permanece registrada com sucesso. Isso não valida entrega de mensagens com candidatos reais.

Jobs diário e worker continuam ativos, horários `0 11 * * *` e `* * * * *`. Fila: 19 enviados, 35 falhos e quatro cancelados; nenhum pendente/processando. Não foram repetidos envios nem alterados registros. Falhas antigas continuam exigindo reconciliação individual antes de qualquer repetição.

## Achado e correção de cabeçalhos

Verificação externa inicial do backend: TLS 1.3 com certificado validado, expiração em 05/01/2027; rotas administrativas `/project/default` e `/pg/` retornavam 404, dados/funções sem autenticação retornavam 401. As respostas não continham HSTS/nosniff/política de referência.

Adicionados ao único bloco server de `/opt/workout-supabase/public-gateway.conf`, com `always`:

```nginx
add_header Strict-Transport-Security "max-age=15552000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
```

HSTS aplica-se ao hostname do backend, sem includeSubDomains ou preload. O frontend GitHub Pages tem borda própria; esta entrega não altera seus cabeçalhos. CSP e política de enquadramento de arquivos devem considerar seus usos e continuam fora desta alteração.

Procedimento: `ops/supabase-self-hosted/public-security-headers.py`. Preparação verifica configuração/imagem, ensaia sem rede e sem portas publicadas, confere nginx e cabeçalhos únicos em 200/404/502, depois remove o container descartável. Primeira tentativa isolada falhou por permissões de execução com capabilities removidas; produção intacta. Repetição com UID 101 e tmpfs correspondentes passou, sem ampliar capabilities. Evidência da falha preservada.

Aplicação conferiu hashes e identidade do container, manteve o inode do arquivo montado e executou nginx -t/reload. Container/imagem preservados; banco, Auth, filas e serviços upstream não foram recriados. Configuração anterior SHA256 `00c3a5c4b4b70ee8044fbb2b211c43918f7708f39a38bf25974bd79457153b45`; posterior `912e68255e31f4e9bb11231ef9032994bb659e77035f305a4cedea327d84ac48`.

Verificação externa posterior: três cabeçalhos presentes nas cinco rotas examinadas, mesmos 401/404. Saúde/configuração pública de Auth com chave anon retornaram 200; consulta anon de alunos continuou 401; preflight REST retornou 200 com CORS válido. Nenhuma senha, mensagem real ou chamada de IA envolvida. Não é pentest exaustivo nem validação de todos os navegadores.

## Backup, evidência e retorno

Backup anterior `20261015T170330Z`, posterior `20261015T171145Z`: cinco arquivos de cada copiados para o computador e SHA256 conferidos. Evidência privada anterior/posterior em `C:/Users/pejon/.codex/ssh-workout04/public-headers-20261015/`; arquivo posterior de 1.696 bytes, SHA256 `9313224024430f3a15704635695dd692d700820c32ccaf5f22edfe9d31ee0b0f`.

Retorno: revisar estado privado em `/home/ubuntu/workout-public-headers-20261015`, comparar os hashes e executar `sudo python3 /home/ubuntu/public-security-headers-20261015.py rollback`. O comando recusa alterações posteriores; não usar para sobrescrever outra entrega. Não foi necessário executar retorno em produção. HSTS já recebido pode permanecer no navegador até expirar; remover a diretiva não apaga imediatamente esse estado. Se houver necessidade real de desativá-lo, servir `max-age=0` por HTTPS válido após decisão operacional.

Fonte primária: [herança e parâmetro always do Nginx](https://nginx.org/en/docs/http/ngx_http_headers_module.html).
