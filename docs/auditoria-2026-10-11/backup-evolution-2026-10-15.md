# Backup da integração WhatsApp — 15/10/2026

## Lacuna corrigida

Os backups diários do Workout não continham os bancos/configuração da Evolution. A imagem executável já preservada não substituía esses dados. A leitura da VM confirmou três bancos PostgreSQL e o volume `/app/dbdata` vazio; a integração atual usa os bancos para persistência.

O procedimento instalado agora inclui `evolution/` em **runtime.tar.gz**, mantendo os mesmos cinco arquivos do snapshot e a sincronização Windows existente. Inclui dumps dos três bancos, roles, configuração dos quatro containers, credenciais/configuração de implantação, proxy e túnel. Contém dados pessoais, chaves, licença e senhas: exclusivamente no armazenamento privado, fora do Git.

Fontes: `ops/supabase-self-hosted/backup.py` e `evolution_backup.py`, instalados juntos em `/opt/workout-supabase/`. SHA256 instalado: backup `27952505f84e3ed8e6bd1c60001b226146f9fbb5e34426b14aed29586092a391`; helper `304d9f73b3b078943a379daea0d5155c57d34c5318d3f2bf88f97a3a23c95c74`.

Os dumps são consistentes individualmente; não existe transação atômica comum aos três bancos. Contagens antes/depois são registradas para comparação. Se uma versão futura passar a escrever arquivos no volume dbdata, o procedimento recusa a cópia até revisar o método consistente; não copia SQLite ativo como se fosse arquivo estático. Logs não são dados de recuperação obrigatórios e não foram incorporados. Imagem/referência e digest PostgreSQL registrados; a imagem continua disponível localmente, não foi exportada novamente neste lote.

## Snapshot final e recuperação comprovada

Snapshot **20261015T174108Z**: manifesto identifica `evolution_backup_format: 1`; runtime.tar.gz com 20.709.397 bytes e SHA256 `8160a4dd7eedb2496c1c26fbd0b3bdea06e2fb54b48afa46a02a9779c1a5bf8f`. Cinco arquivos copiados ao computador e hashes conferidos pela sincronização instalada e por leitura independente local. Timer existente permanece ativo; observar primeiro ciclo automático com esta ampliação.

1. Cópia inicial testada em PostgreSQL descartável sem rede/portas publicadas.
2. Recuperação repetida a partir do **runtime.tar.gz final**, usando `restore-evolution.py`, tentativa 2. Três bancos restaurados: 18 tabelas/322.744 registros, quatro tabelas/cinco registros e um banco sem tabelas de aplicação. Contagens coincidiram com o baseline estável do backup e após reinício do PostgreSQL descartável. Configuração obrigatória presente; container e diretório de banco temporários removidos.
3. Mesmo snapshot final passou novamente nas **39 verificações do núcleo Workout**, tentativa 6, em 20,34 segundos: Auth, REST, Storage, funções, banco principal e metadados; cleanup de containers/rede/envs confirmado. Não é RTO de desastre em servidor vazio.

Nenhuma instância adicional da Evolution foi iniciada; nenhuma licença ativada, sessão WhatsApp conectada em duplicidade ou mensagem enviada. Containers de produção permaneceram em execução, com datas de partida anteriores ao exercício. Leitura posterior do status retornou connected=true e loggedIn=true.

## Limites e procedimento de retorno

O teste demonstra recuperação de dados/configuração, não reconexão garantida ao WhatsApp em outro host. Licença, túnel, DNS, disponibilidade das imagens e eventual necessidade de novo QR devem ser conferidos em um desastre real. Roles/senhas foram preservadas no backup, mas não aplicadas ao PostgreSQL de teste; o teste usou conta exclusiva de recuperação. Configurações recuperadas nunca devem ser executadas automaticamente sem revisão: incluem credenciais reais e poderiam iniciar envios.

Para repetir: conferir hashes do snapshot, copiar `restore-evolution.py` e `evolution_backup.py` juntos para diretório privado na VM, escolher uma tentativa inédita de 1 a 999 e executar como root contra runtime.tar.gz. O script recusa diretório/container já existente e não inicia o provedor.

Fonte anterior do backup preservada em `/home/ubuntu/workout-evolution-backup-20261015/backup.before.py`. Em falha do novo procedimento, preservar o snapshot incompleto e logs privados, comparar a versão instalada e reverter somente a fonte do procedimento, mantendo o helper; repetir backup e sincronização. Não restaurar banco de produção para desfazer alteração de ferramenta. Esse retorno remove a cobertura Evolution e exige correção posterior; não foi necessário executá-lo.

Evidência privada copiada: `C:/Users/pejon/.codex/ssh-workout04/evolution-backup-20261015/evidence.tar.gz`, 3.343 bytes, SHA256 `05a924c502688c50cb41f0a07e4d6e572c4103f14f53fef27d7c05313cdbddb6`. Snapshot completo no diretório privado `backups/20261015T174108Z`. Backup externo independente continua a definir com o proprietário.
