# Mensagens predefinidas — confiabilidade básica

## Correções de 15/10/2026

- Falha de consulta agora apresenta erro e opção de tentar novamente, sem parecer catálogo vazio.
- Edição/exclusão exigem confirmação do registro afetado; registro ausente não produz aviso de sucesso.
- Falha de salvamento preserva campos e formulário. Uma trava síncrona impede submissões simultâneas.
- Criação mantém o mesmo UUID durante tentativas no formulário aberto. Conflito só é recuperado se título e conteúdo forem iguais; não sobrescreve registro diferente.
- Alterações e vínculos atualizam os caches do catálogo e do envio manual.
- Exclusão de modelo vinculado avisa sobre o texto padrão da automação.

## Evidências

Node 22: tipos estritos, ESLint, alcance de módulos, build e **342 testes em 44 arquivos** aprovados. Scanner do repositório: 442 arquivos, zero padrões detectados; isso não equivale a ausência absoluta de segredos.

Homologação isolada: nove verificações HTTP de login e CRUD, incluindo conflito de UUID e operações sem registro. Fixture removida e baseline de usuários, modelos, configurações, alunos, avaliações e fila restaurado. Nenhum envio real ou chamada paga de IA. Script: `ops/supabase-self-hosted/verify-template-crud.py`.

Evidência privada local: `C:/Users/pejon/.codex/ssh-workout04/template-qa-20261015.json`, SHA256 `f2c5266af544411f8c14fe616ae42f8b6f22121cd3b6d6473a3914515f2dcb89`.

Backup anterior: **20261015T191602Z**, cinco arquivos copiados ao computador e SHA256 verificado às 16:16 de Brasília.

## Publicação e retorno

Publicado em `f13ae5b987d432ed0a33f596fceec70ced31f1fd`; [workflow 38792640691](https://github.com/prodigigamerbr123-ui/echo-site-clone-94/actions/runs/38792640691) concluído com sucesso, incluindo auditoria de dependências. Entrada `index-thHeGeZH.js` e rota `MensagensPredefinidas-v815J6xi.js` conferidas por SHA256 contra o build local. SHA256 da rota: `450c14f7f1fcae9d500ee6b3df384c16dbfcb866d7da13f83ce4fd619f914d4c`. Verificação de produção somente de leitura; não foram criados modelos reais. Retorno: reverter o commit deste lote e publicar pelo mesmo workflow; nenhuma migração ou alteração de dados de produção é necessária.

## Limites

UUID não persiste após fechar/reabrir o formulário ou recarregar a página. Não há controle de edição concorrente entre dispositivos. Recuperação de resposta incerta tem teste unitário e conflito real de UUID em homologação; perda real de conexão não foi provocada. Sem nova validação visual em navegador neste lote. As pendências gerais de infraestrutura, backup externo e operação prolongada permanecem no handoff.
