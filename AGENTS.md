# Repository Guidelines

## Project Structure & Module Organization

Workout manages gym students, physical assessments, WhatsApp delivery, and AI workflows. The frontend uses React, TypeScript, Vite, Tailwind, and shadcn/ui.

- `src/pages/`: route screens; `src/components/`: application components and `ui/` primitives.
- `src/hooks/`, `src/lib/`, `src/utils/`: shared behavior; `src/integrations/`: Supabase integration.
- `src/assets/` and `public/`: bundled and static assets.
- `src/test/`: frontend and database contract tests.
- `supabase/functions/`: Deno Edge handlers and `_shared/` contracts; `supabase/migrations/`: ordered SQL migrations; `supabase/tests/`: HTTP fixtures.
- `ops/`: VM deployment, backup, and isolated validation tools; `docs/`: audit evidence and operational notes.

## Build, Test, and Development Commands

Use Node.js 22, matching CI, and npm with `package-lock.json`.

- `npm ci`: install locked dependencies.
- `npm run dev`: start Vite locally.
- `npm run build`: generate production output in `dist/`.
- `npm run preview`: serve the generated build locally.
- `npm run lint`: run ESLint.
- `npx tsc --noEmit -p tsconfig.app.json`: check application types.
- `npm test`: run Vitest once; `npm run test:watch`: watch mode.
- `npm run audit:security`: fail dependency auditing on high or critical findings.

The GitHub Pages workflow runs security, types, lint, tests, and build before deployment from `main`.

## Coding Style & Naming Conventions

Follow adjacent TypeScript: two-space indentation, double quotes, and semicolons. Use PascalCase for React components, camelCase for functions, and `use` prefixes for hooks. Prefer `@/` imports for frontend modules. Reuse shared contracts and existing UI primitives. Name migrations `YYYYMMDDHHMMSS_description.sql`; add new migrations instead of rewriting applied history.

## Testing Guidelines

Vitest uses jsdom, React Testing Library, and `src/test/setup.ts`; database authorization tests use PGlite. Name tests `*.test.ts` or `*.test.tsx` (`*.spec.*` is also supported). Run targeted tests with `npm test -- src/test/evaluation-due.test.ts`. No numerical coverage threshold is configured. Cover changed behavior, authorization boundaries, and failure paths. For Deno HTTP checks, follow `supabase/tests/README.md`.

## Commit & Pull Request Guidelines

Recent commits use imperative English subjects, such as `Harden cron authentication and sanitize endpoint failures`; Conventional Commit prefixes are not required. Keep commits focused. PRs should explain behavior changes, relevant issues, checks performed, and deployment or rollback implications. Include screenshots for UI changes.

## Security & Operations

Keep secrets, database dumps, SSH keys, and private container inspections outside Git. Use disposable staging fixtures for integration checks. Exclude real WhatsApp sends and paid AI requests from automated tests. Production changes require verified backups and a rollback procedure. Preserve unrelated local work and the current shared-admin requirement.
