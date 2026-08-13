# Insights — server

Server-side decisions and dead ends. Read before redesigning anything here; a
lot of what looks arbitrary was a deliberate trade-off.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here. Insights about `src/vendor/shared/` go in the **root** `INSIGHTS.md` —
a contract change reaches every package.

---

## Decisions

### 2026-07-31 — Schema-first validation at the route boundary

**What:** every route declares Zod `params`/`body`/response schemas from
`@devdigest/shared` via `fastify-type-provider-zod`; invalid input is rejected
with `422` before the handler runs.
**Why:** one definition has to drive both request validation and response
serialization, or the two drift.
**Rejected:** hand-rolled `Schema.parse(req.body)` inside each handler — it
validated input only, left responses unchecked, and duplicated the schema
reference in every route.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-13** — A repository class with a `private db: Db` constructor
  param (e.g. `ReviewRepository`) is nominally typed by that private field —
  TypeScript will not accept a duck-typed stub object in its place, only a
  real instance backed by a real `Db`. Any service/classifier that takes one
  of these repositories as a constructor dependency (e.g.
  `IntentClassifier(container, repo: ReviewRepository)`) therefore cannot get
  a genuinely hermetic unit test, even though its other dependencies (LLM,
  GitHub) are mockable via `Container` overrides — write it as a
  `.it.test.ts` against a real Postgres instead, per `../TESTING.md`'s "one
  real integration per data-backed workflow." `src/modules/reviews/repository.ts:30`

## Tool & Library Notes

- **2026-08-13** — `ContainerOverrides.llm` is a `Record` keyed by provider id
  (`'openai' | 'anthropic' | 'openrouter'`); `container.llm(id)` looks up
  `overrides.llm?.[id]` by that key, not by the injected instance's own
  `.id` field. So a `MockLLMProvider` — whose constructor type only accepts
  `'openai' | 'anthropic'` — can still be registered to answer for
  `'openrouter'` calls: `overrides: { llm: { openrouter: new
  MockLLMProvider('openai', { structuredBySchema: {...} }) } }`. Needed for
  any feature whose `resolveFeatureModel` default routes through
  `openrouter` (e.g. `review_intent`). `src/platform/container.ts:170`

## Recurring Errors & Fixes

- **2026-08-13** — `pnpm db:migrate` failing with `relation "X" already exists`
  on a local dev DB (not a fresh one) means the migration-tracking table is out
  of sync with `src/db/migrations/*.sql`, most likely because a merge
  regenerated/renumbered migration files whose DDL your DB already had applied
  under a different file. Drizzle's postgres-js migrator does **not** compare
  per-file hashes to decide what's pending — it only compares each migration's
  journal timestamp (`meta/_journal.json`'s `when`) against the single latest
  `created_at` in `drizzle.__drizzle_migrations`, and reruns anything newer
  (`node_modules/drizzle-orm/pg-core/dialect.js`, `migrate()`). If a later
  migration's `when` is newer than your last-applied `created_at` but its DDL
  is already live (verify with `\d <table>` per object in the file), don't hand
  edit the `.sql` — insert a row into `drizzle.__drizzle_migrations` with that
  migration's sha256 file hash and its `when` as `created_at`, so the tracker's
  "latest applied" moves past it and only genuinely-new migrations run.
- **2026-07-XX** — Newer Anthropic models (e.g. Opus 5) reject requests with a
  `temperature` param at all — a `400`, not a clamped/ignored value — even the
  harmless `0` / `0.2` defaults we used to always send. Only include
  `temperature` in the request when the caller explicitly passed one
  (`req.temperature !== undefined`); omit-by-default, don't default-to-a-number.
  `server/src/adapters/llm/anthropic.ts`

## Open Questions

_None yet._
