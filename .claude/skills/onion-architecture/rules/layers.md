# The Dependency Rule

## The four layers

1. **Domain (core)** — `modules/<name>/domain.ts` (optional, see `domain-model.md`). Entities, value objects, business rules. No imports from a framework, an ORM, or the network.
2. **Application** — `modules/<name>/service.ts`. Orchestrates a use case: calls the domain, calls repositories/adapters *through their port interface*, returns a domain/DTO type.
3. **Infrastructure** — `modules/<name>/repository.ts` (+ `modules/<name>/repository/*.repo.ts` when split, e.g. `reviews`), `adapters/<port>/*`. The only layer allowed to know about Drizzle, `db/schema*.ts`, SDKs (`octokit`, `openai`, `simple-git`), the filesystem, or `fetch`.
4. **Presentation** — `modules/<name>/routes.ts`. Fastify handlers + Zod request/response schemas. Depends on Application only.

A fifth thing, the **composition root** (`platform/container.ts`), sits outside all four layers by design: it is the one place in the codebase allowed to import and construct concrete Infrastructure classes and hand them to Application code as interfaces.

## The Dependency Rule

> Source code dependencies can only point inward. Nothing in an inner layer can know the name of anything declared in an outer layer.

(Paraphrased from Robert C. Martin's *Clean Architecture* — Onion Architecture uses the same rule, see `references.md`.)

Concretely: a type, class, or function name that lives in `repository.ts` or `adapters/*` must never appear in the source of `domain.ts`. A type that lives in `service.ts` must never appear in `domain.ts`. `routes.ts` may reference `service.ts`, but nothing may reference `routes.ts`.

## Forbidden imports by layer

| Layer / file | Must **not** import |
|---|---|
| `domain.ts` | `drizzle-orm`, `../../db/*`, `fastify`, anything under `adapters/*` |
| `service.ts` | `../../db/schema*.js` / `../../db/rows.js` types used as return types, `drizzle-orm` operators (`eq`, `and`, `desc`, ...), Fastify `Request`/`Reply` types, concrete adapter classes (`OpenAIProvider`, `OctokitGitHubClient`, `SimpleGitClient`, ...) |
| `repository.ts`, `adapters/<port>/*` | nothing forbidden — this is the one layer allowed to know about Drizzle, SDKs, the filesystem |
| `routes.ts` | `../../db/*`, concrete adapter classes; only `service.ts` and Zod schemas |

## What "depends on" means in practice

- `service.ts` calling `container.agentsRepo.findById(id)` and getting back a *mapped* domain/DTO type — fine.
- `service.ts` importing `AgentRow` from `repository.ts` and returning it straight through to a route handler — a violation (the route now serializes raw DB columns; a schema rename becomes an API-breaking change with no compiler warning at the API boundary).
- `service.ts` calling `await container.llm('openai')` (returns the `LLMProvider` port) — fine.
- `service.ts` doing `new OpenAIProvider(key)` — a violation; it bypasses the composition root and can't be swapped for a mock in tests.
