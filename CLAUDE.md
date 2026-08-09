# DevDigest — CLAUDE.md

Local-first AI PR review. Course starter (see README.md for the full lesson
roadmap and architecture diagram) — this file is a map, not documentation.

## Stack
Node ≥22 · pnpm ≥10 · TypeScript 5.7 · Docker (Postgres 16 + pgvector, DB only).

## Commands
```
./scripts/dev.sh                 # boots Postgres + migrates + seeds + API + web
cd server && pnpm test            # unit + integration
cd client && pnpm test            # vitest + jsdom
cd reviewer-core && pnpm test     # hermetic engine tests
./scripts/e2e.sh                  # hermetic browser e2e
```

## Package map
| Package | What | Own CLAUDE.md |
|---|---|---|
| `server/` | Fastify API + Drizzle/Postgres | `server/CLAUDE.md` |
| `client/` | Next.js studio UI | `client/CLAUDE.md` |
| `reviewer-core/` | pure review engine (diff→prompt→LLM→findings) | `reviewer-core/CLAUDE.md` |
| `e2e/` | deterministic browser e2e | `e2e/CLAUDE.md` |

Each package's own `CLAUDE.md` auto-loads when you touch a file inside it —
this root file only carries what's true across all of them.

## Read when
- Working inside a package → that package's own `CLAUDE.md` loads
  automatically; its `README.md` is the source of truth for diagrams.
- Understanding the full review pipeline / architecture diagram → `README.md`.
- Test strategy (unit vs integration split, CI workflows) → `TESTING.md`.
- A per-package feature spec, deeper design note, or lesson learned →
  `<package>/specs/`, `<package>/docs/`, `<package>/INSIGHTS.md`.

## Non-default conventions
- Branch naming: `feat/<TAG>-<kebab-case-description>`, e.g.
  `feat/HW1-findings`, `feat/LAB2-implementing-skills`. `<TAG>` is the
  assignment/lesson identifier (e.g. `HW1`, `LAB2`); the description is a
  short kebab-case summary of the work.
- **Not** a monorepo workspace — each package has its own lockfile; install per
  folder (`cd server && pnpm install`, etc). Cross-package sharing (e.g.
  `@devdigest/shared` Zod contracts) is via tsconfig path aliases, not a
  published/linked package.
- Migrations are **never** applied automatically on boot — always
  `pnpm db:migrate` by hand after pulling schema changes.
- Secrets (API keys, GitHub token) live in `~/.devdigest/secrets.json`
  (mode `0600`), never in `.env`, the DB, or git.

## Do-not-touch
- `server/src/db/migrations/*.sql` — generated via `pnpm db:generate`; never hand-edit.
- `server/src/vendor/shared` and `client/src/vendor/shared` — manually mirrored
  copies of the same contracts; they can drift (`diff` them before editing only one side).
