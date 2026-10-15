# Troca da senha do proprietário — 15/10/2026

## Autorização e execução

O proprietário autorizou explicitamente aplicar a senha preparada e encerrar sessões antigas. O perfil existente foi preservado: mesmo usuário, email, vínculo administrativo e dados. Não foi criado outro administrador, configurado SMTP ou alterada a exigência de login compartilhado.

Procedimento `ops/supabase-self-hosted/rotate-owner-password.py`: recebe plano e senha pelo stdin protegido por SSH, confere identidade/estado anterior e hash do candidato, usa a API administrativa do Auth para atualizar a senha e verifica login e RPC do dashboard com o token do proprietário. Não edita hashes diretamente no banco, não inclui senha em argumentos de processo e não imprime tokens ou credenciais.

A nova senha permanece somente no arquivo privado local `C:/Users/pejon/.codex/ssh-workout04/owner-password-20261015/senha.txt`, em diretório com ACL restrita ao usuário Windows. Não copiar seu conteúdo para Git, relatórios ou conversa. Plano local marcado como aplicado; estado de execução privado na VM em `/home/ubuntu/workout-owner-password-20261015/result.json`.

## Verificação

- Nova senha autenticou o mesmo proprietário e permitiu consultar o dashboard.
- Sete sessões existentes antes da troca; após logout global e encerramento da sessão de teste, **zero sessões e zero refresh tokens não revogados** para o perfil no instante da conferência.
- Refresh da sessão de teste e amostra anterior recusados após o logout.
- Fingerprints de alunos, avaliações, staff e identidades preservados; contagens de mensagens, fila e usuários iguais. Isso não compara byte a byte o conteúdo de todas as tabelas.
- Nenhuma mensagem WhatsApp, chamada de IA paga ou mudança de senha técnica de serviços foi executada por este procedimento.

Logout global revoga a renovação das sessões. JWTs de acesso já emitidos podem continuar válidos até expirar; o token verificado tinha duração configurada de **3.600 segundos**. Não se afirma revogação instantânea de todos os access tokens nem rotação do segredo JWT. Esse é o comportamento documentado do [signOut do Supabase](https://supabase.com/docs/reference/javascript/auth-signout).

## Backup e recuperação administrativa

Backup anterior `20261015T185537Z` e posterior `20261015T190428Z`: cinco arquivos de cada copiados para o computador e hashes conferidos. O posterior contém a senha atual em hash e o estado de sessões encerradas no instante do backup. Evidência sanitizada privada: arquivo `server-result.json` no diretório local da troca; resumo e hashes mantidos junto do plano, fora do Git.

Não restaurar o banco para desfazer uma senha. Em perda de acesso, usar recuperação administrativa local do Auth para definir outra senha e validar o login, preservando o usuário. O script recusa repetição sobre estado já existente; revisar a fase gravada se uma execução futura interromper após atualizar a senha.

Restaurar backup anterior à troca pode reintroduzir a senha/sessões daquele snapshot. Em recuperação de desastre, revisar a credencial e revogar sessões antes de expor o ambiente recuperado. As demais credenciais técnicas e de provedores continuam com inventário/rotação próprios; esta entrega não as declara concluídas.
