# Publicação de limpeza e segurança — 14/10/2026

## Backend publicado e retomado

A migração 20261014010000 foi aplicada antes dos handlers que exigem a nova RPC. A publicação usou o pacote verificado em staging, com 22 arquivos de runtime; somente oito diferiam da produção anterior. Hashes de todos os arquivos instalados conferem com o manifesto.

- Release e plano de retorno: /opt/workout-releases/20261014-security-quotas.
- Backup imediatamente anterior: 20261014T123618Z.
- Quatro arquivos do backup conferidos no servidor e copiados para fora da VM; SHA-256 local e remoto conferem.
- Arquivos gzip e listagem do arquivo pg_restore verificados antes da implantação.
- Os dois jobs foram pausados, a fila ficou ociosa e o acesso público recebeu manutenção temporária. A configuração original do gateway e os estados originais dos jobs foram restaurados.
- Cinco handlers responderam 401 sem autenticação diretamente no Edge Runtime.
- O endpoint público rejeitou envio sem autenticação com 403.
- Quota registrada nas migrações, RLS ativo e nenhum acesso direto aos contadores por anon/authenticated. A RPC não permite execução anônima.
- Nenhum WhatsApp real ou chamada paga de IA foi disparado pelas verificações.

## Homologação

Ambiente existente isolado, com Auth, PostgREST e Edge Runtime reais da VM, sem credenciais de provedores e com rede interna.

Trinta chamadas concorrentes à RPC: exatamente 20 permitidas e dez recusadas. As quatro rotas protegidas responderam 429 antes de qualquer operação. Foram verificadas também validação de corpos, isolamento dos contadores e exigência do segredo interno. Contas temporárias foram removidas, contagens da base voltaram ao original e os arquivos anteriores de staging foram restaurados.

A primeira execução encontrou um módulo compartilhado ausente no pacote; o pacote foi recomposto com todas as dependências compartilhadas e passou na repetição. A prova final inclui hashes do pacote, do manifesto e da migração, conferidos pelo script de release.

## Frontend

Commit de limpeza preparado: 3a0b185. O frontend será publicado pelo workflow após o commit das proteções e checks. A conclusão do workflow e a conferência do site serão registradas abaixo.

## Retorno

O script release-security-quotas.py oferece a fase rollback. Ela restaura os arquivos anteriores, recarrega o gateway e retoma os jobs nos estados originais. A tabela de quotas pode permanecer sem uso após retorno do código; não é necessário apagar dados da academia.

O estado da operação e logs restritos permanecem na pasta da release. Nenhuma inspeção privada, credencial ou dump foi adicionado ao repositório.
