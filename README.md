# Workout

Aplicação para gestão de alunos de academia, avaliações físicas, agenda, mensagens WhatsApp e automações.

## Arquitetura

- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui.
- Backend: Supabase self-hosted na VM Oracle, com PostgreSQL, Auth, REST, Storage e Edge Functions Deno. Não é necessário usar o Supabase Cloud para a operação atual.
- `src/pages`: telas.
- `src/components`: componentes.
- `src/hooks`: estados e fluxos reutilizáveis.
- `src/lib`: regras de negócio e integrações.
- `supabase/functions`: handlers Deno.
- `ops`: ferramentas operacionais.
- `docs`: evidências e procedimentos.

## Desenvolvimento

Requisitos: Node.js 22 e npm com `package-lock.json`.

```bash
npm ci
npm run dev
npm run build
npm run lint
npm run check:reachability
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run audit:security
```

## Ambiente

Use `.env.example` como referência. Mantenha segredos, tokens e credenciais fora do Git.

Copie o exemplo para `.env.local` e informe a URL do gateway e a chave pública anon do ambiente escolhido. Nunca use uma chave service role em `VITE_*`: essas variáveis são entregues ao navegador. Para homologação, use o gateway isolado; não a base de produção. `npm run dev` imprime a URL local; `npm run preview` serve o resultado de `npm run build`.

TypeScript estrito e verificações de variáveis não usadas estão habilitados. A checagem de alcance detecta módulos de aplicação desconectados da entrada e dos testes; os componentes reutilizáveis em `src/components/ui/` são uma exceção explícita.

## Publicação

Push em `main` dispara `.github/workflows/deploy-pages.yml`: scanner de segredos, dependências, tipos, lint, alcance de módulos, testes e build antes do GitHub Pages. A configuração pública de produção está em `.github/workout-backend.env`. Edge Functions e migrações têm publicação própria na VM; um deploy do frontend não as aplica automaticamente. Consulte o runbook para ordem e retorno.

## Operação

Consulte `docs/OPERATIONS-RUNBOOK.md` e os relatórios em `docs/auditoria-2026-10-11/`.

O estado consolidado está em [handoff.md](handoff.md); o [índice de evidências](docs/auditoria-2026-10-11/README.md) indica as entregas mais recentes. O dono usa perfil pré-configurado por decisão do cliente; SMTP e contas individuais não fazem parte do escopo atual. Backup externo independente ainda depende de um destino a definir.

Alterações de produção exigem backup verificável e procedimento de rollback.

## Testes

Testes automatizados não enviam WhatsApp real e não executam chamadas pagas de IA.
