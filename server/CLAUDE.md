# server/ — CLAUDE.md

`@devdigest/api` — Fastify + Drizzle/Postgres. Map only; see `README.md` for
the request/DI-flow diagram and API map.

## Stack
Fastify 5 · Drizzle ORM · `postgres` (pgvector) · Zod via
`fastify-type-provider-zod` · tsx (dev) · vitest.

## Commands
```
pnpm dev                                              # :3001, tsx watch
pnpm db:generate                                       # after editing db/schema/*.ts
pnpm db:migrate                                         # NOT automatic on boot
pnpm exec vitest run --exclude '**/*.it.test.ts'         # unit only, no Docker
pnpm exec vitest run .it.test                            # integration, needs Docker
```

## Map
- `modules/<name>/{routes,service,repository}.ts` — one feature module per
  domain (`repos`, `pulls`, `reviews`, `agents`, `repo-intel`, `settings`,
  `workspace`, `polling`).
- `adapters/<port>/` — real implementations (llm, github, git, astgrep,
  secrets, embedder, tokenizer); `adapters/mocks.ts` swaps them in tests.
- `platform/container.ts` — DI container wiring adapters into services.
- `db/schema/*.ts` — Drizzle table definitions; `db/migrations/*.sql` generated, do not hand-edit.

## Read when
- Adding/changing a route, DI wiring, or the error envelope → `README.md` (request & DI flow diagram).
- Touching prompt assembly or the grounding gate → `../reviewer-core/README.md`.
- Writing a DB-backed test → `test/helpers/pg.ts` + `../TESTING.md` (must be named `*.it.test.ts`).
- Drafting a change before building it → `specs/`. A gotcha not obvious from
  the code → `INSIGHTS.md`. Deeper design notes → `docs/`.
- Finishing a task with a non-obvious lesson → capture it via
  `.claude/skills/engineering-insights` (or run `/engineering-insights`);
  treat existing `INSIGHTS.md` entries as high-confidence guidance before
  starting related work.

## Gotchas
- The unit/integration split is by **filename**, not folder — a DB-backed test
  not suffixed `*.it.test.ts` silently runs (and fails) in the wrong CI job.
- `REPO_INTEL_ENABLED` defaults to `true` but degrades silently to a diff-only
  prompt when the repo isn't indexed yet — no error is raised.
- `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is only a legacy fallback.

## Do-not-touch
- `db/migrations/*.sql` — regenerate via `pnpm db:generate`, never edit by hand.
- `src/vendor/shared` — mirrors `client/src/vendor/shared`; check `diff` before
  editing only one side.
