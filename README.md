# Workout

Aplicação para gestão de alunos de academia, avaliações físicas, agenda, mensagens WhatsApp e automações.

## Arquitetura

- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui.
- Backend: Supabase com migrations e Edge Functions.
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
npx tsc --noEmit -p tsconfig.app.json
npm test
```

## Ambiente

Use `.env.example` como referência. Mantenha segredos, tokens e credenciais fora do Git.

## Operação

Consulte `docs/OPERATIONS-RUNBOOK.md` e os relatórios em `docs/auditoria-2026-10-11/`.

Alterações de produção exigem backup verificável e procedimento de rollback.

## Testes

Testes automatizados não enviam WhatsApp real e não executam chamadas pagas de IA.
