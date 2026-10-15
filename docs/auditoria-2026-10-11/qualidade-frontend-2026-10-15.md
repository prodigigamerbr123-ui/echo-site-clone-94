# Qualidade do frontend — 15/10/2026

## Alterações e motivo

- Ativados TypeScript `strict`, `noImplicitAny`, verificações de variáveis/parâmetros não usados e fallthrough; regra ESLint de variáveis não usadas também ativada. Corrigidos os 21 diagnósticos iniciais de tipos, incluindo campos realmente anuláveis do banco. Não foram usados `any` ou asserções para esconder esses contratos.
- Tipos de alunos/mensagens agora derivam dos contratos do banco. Status de mensagem nulo recebe rótulo explícito. O contrato de edição de observações admite `null`, correspondente à limpeza prevista na operação SQL existente.
- Removidos 17 módulos de aplicação sem referências: telas antigas já substituídas por redirecionamentos, dashboard abandonado e formulário legado. Componentes shadcn reutilizáveis preservados. A remoção facilita manutenção; não implica redução proporcional do bundle, pois o build já eliminava código desconectado.
- Novo `npm run check:reachability`, também no CI, percorre imports/exports estáticos e imports dinâmicos literais. Entrada, testes e declarações são raízes; módulos de UI são exceção explícita. Detecta módulos desconectados, não exports individuais; imports dinâmicos calculados exigem revisão.
- Agenda separada em formulário, lista, fila de vencidos, pendências, diálogo e tipos em `src/components/avaliacoes/`. Página mantém a orquestração das consultas e operações existentes.
- Corrigido bug: o parâmetro `?aluno=` era reaplicado após atualizar os alunos e podia sobrescrever uma seleção manual. Agora cada pré-seleção é aplicada uma vez, aguardando o aluno estar disponível.
- Formulário e agenda distinguem carregamento, falha e vazio; métricas indisponíveis exibem traço. Controles ganharam nomes acessíveis e estados de bloqueio durante operações. Texto de lembretes corresponde às automações habilitadas.

## Validação local e homologação

- Node 22.23.3; **322 testes em 39 arquivos aprovados**, incluindo 16 novos cenários de nulidade, componentes e pré-seleção.
- Tipos estritos, lint, alcance e build aprovados; `npm audit --audit-level=high`: zero vulnerabilidades reportadas nesta consulta.
- Build: entrada 214,89 kB (gzip 68,41 kB), agenda 40,68 kB (gzip 13,18 kB). Não representa medição de experiência em celular/rede lenta.
- Login sintético e renderização da agenda conferidos no gateway de homologação, sem criar avaliações ou enviar mensagens. Conta/sessão próprias removidas e contagens iniciais preservadas: quatro usuários, seis alunos, seis avaliações e 68 mensagens agendadas. Processos temporários locais encerrados.
- Backup pré-publicação `20261015T170330Z`: cinco arquivos copiados para o computador e SHA256 conferidos pela sincronização instalada.

## Publicação e limites

Frontend publicado: commit `b9814268c5ed2996f3d448960ce982b62bff79e2`, [workflow 38774544059](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38774544059) concluído com sucesso. Em produção, entrada `index-DWWKfN4c.js` e agenda `AgendarAvaliacao-BMDa4qCy.js` responderam 200 e seus bytes coincidiram com o build local validado. SHA256: entrada `68654f150d45cd02a44609bf10799199d4af754a471877a6116dc21db0ba94cc`; agenda `00d94d721e144d0fac90e02ec7e66e03b7acf0a067eb9addddca8be14e2fea86`. Scanner pré-publicação: 422 arquivos, zero padrões detectados; cinco testes do scanner aprovados. Não exige migração de banco. Remoção de um import não usado na função `ai-assistant` é apenas limpeza de fonte; runtime Edge continua na revisão anterior até sua próxima publicação, sem mudança de comportamento requerida por esta interface.

Retorno: republicar a revisão/artefato frontend anterior `892bb88`; não restaurar banco para desfazer interface. Preservar novos backups e alterações de infraestrutura posteriores.

Continuam abertos: revisão das demais telas, acessibilidade/mobile abrangente, testes de carga, riscos dos outros containers, rotação coordenada e recuperação em host vazio. Cliente dispensou SMTP e informou não possuir destino de backup externo; manter perfil pré-configurado e registrar a dependência de armazenamento independente.
