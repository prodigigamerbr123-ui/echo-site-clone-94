# Ferramentas administrativas sob demanda — 15/10/2026

## Decisão proporcional ao uso

Studio e postgres-meta são ferramentas administrativas, não requisitos do atendimento diário. Estavam em execução sem portas publicadas no host, com acesso administrativo já bloqueado na borda pública. O inventário de 14/10 registrava muitos alertas em suas imagens. Esta entrega reduz componentes ativos e credenciais administrativas em processos sempre ligados; **não atualiza essas imagens nem elimina seus achados**.

Implementação: `ops/supabase-self-hosted/admin-on-demand.py`. Studio/Meta têm perfil Compose `admin` e restart `no`. Gateway passou a depender da saúde do banco, em vez de Studio; Studio, quando solicitado, depende de Meta. A comparação das configurações efetivas confirmou que os demais valores de todos os serviços ficaram iguais, inclusive imagens, ambientes, portas e volumes. Placeholders do .env foram preservados no YAML, sem congelar credenciais expandidas.

## Validação e publicação

- Configuração padrão habilita dez serviços essenciais e exclui Studio/Meta. Perfil admin continua válido para manutenção explícita.
- Gateway real testado em rede interna de homologação com Studio/Meta deliberadamente ausentes, antes e depois de reinício: dez verificações registradas de Auth, REST autorizado/negado, Storage e negativa da função diária, além da saúde Auth nas duas partidas. Nenhum dado foi criado ou provedor iniciado.
- Aplicação em produção alterou somente o compose e a política de reinício das duas ferramentas, depois as parou. Containers, imagens, execução e datas de partida dos serviços essenciais permaneceram iguais. Nenhum banco ou serviço essencial foi recriado.
- **20 verificações em produção aprovadas e repetidas**: identidade/estado dos 12 containers do projeto, dados/senhas comparados, seleção padrão do perfil e seis rotas internas. Fingerprints abrangem alunos/avaliações, contagens de mensagens/fila, usuários/senhas e Storage; não equivalem a comparação byte a byte de todos os bancos.
- Conferência externa: Auth health/settings 200 com chave pública; `/project/default` e `/pg/` 404; alunos/função diária sem autenticação 401. HSTS preservado nas seis respostas. Handshake WebSocket público abriu normalmente. Não é teste de todos os eventos/canais de Realtime.

Compose anterior SHA256 `10581ee15712c87444e4a7150248c18846c307073c1d40afc8747b336b9eadff`; posterior `56fd58c501c937934fd330f7d47259c294f34948888f3edb5dd4c32bafbfb4a6`.

Backup anterior **20261015T184628Z** e posterior **20261015T184842Z**: cinco arquivos de cada copiados para o computador e SHA256 conferidos. O posterior contém o compose atualizado e a cobertura Evolution da entrega anterior. Evidência privada posterior: `C:/Users/pejon/.codex/ssh-workout04/admin-on-demand-20261015/post-release.tar.gz`, 24.424 bytes, SHA256 `f2d9b9fef6d1180dbe693a1babf4903ba536f6acb37e0da645fbb71c253c7193`.

## Manutenção e retorno

Ativar somente quando necessário, na VM, com acesso administrativo restrito:

```bash
cd /opt/workout-supabase
sudo docker compose --profile admin up -d meta studio
# Ao terminar a manutenção:
sudo docker compose --profile admin stop studio meta
```

O comando de ativação pode conferir/iniciar dependências essenciais já existentes; não usar `down`, que pode parar serviços essenciais. Não persistir COMPOSE_PROFILES=admin no .env. Não expor Studio/Meta por nova porta pública; usar túnel SSH e a autenticação administrativa existente. Reavaliar suas imagens antes de uma sessão prolongada de manutenção.

Retorno da entrega: revisar estado privado e executar `sudo python3 /home/ubuntu/admin-on-demand-20261015.py rollback`. O procedimento verifica hash atual do compose, artefato anterior e identidades dos containers; recusa sobrescrever alterações posteriores. Restaura apenas fonte/políticas e inicia as duas ferramentas se estavam ligadas anteriormente; não restaura banco. Não foi necessário executá-lo. Uma ativação posterior que recrie os containers exige revisar esse retorno datado.

## Credencial do proprietário

Foi preparado um candidato forte fora do Git, em diretório Windows com acesso restrito ao usuário, para substituir a senha de entrada do proprietário. **Nenhuma senha foi alterada e nenhuma sessão foi encerrada neste lote.** A aplicação depende da resposta do proprietário porque exigirá entrar novamente no painel. Esse preparo não conclui a rotação das demais credenciais.

Fonte primária: [perfis e ativação explícita no Docker Compose](https://docs.docker.com/compose/how-tos/profiles/).

Atualização posterior: o proprietário autorizou a troca, executada e verificada em [senha do proprietário](senha-proprietario-2026-10-15.md). O preparo descrito acima registra o estado daquele lote. O verify datado desta entrega compara a senha anterior e não deve ser usado como monitor após essa troca intencional; não alterar a evidência antiga para mascarar a diferença.
