---
name: onion-architecture
description: "Forces Onion Architecture layering (Domain -> Application -> Infrastructure -> Presentation, dependencies point inward only) for DevDigest's backend modules (server/src/modules/<name>/{routes,service,repository}.ts) and adapters (server/src/adapters/<port>/, @devdigest/shared port interfaces). Use when creating a new backend module, adding a repository or external integration, wiring dependencies in platform/container.ts, or reviewing whether a service.ts leaks persistence types (Drizzle rows, db/schema) or framework types (FastifyRequest) across a layer boundary. Trigger terms: onion architecture, layering, service leaking repository types, domain layer, anemic model, port and adapter, dependency inversion, composition root, DI container."
metadata:
  tags: architecture, backend, ddd, onion, ports-and-adapters, fastify, drizzle, server
---

## When to use

Use this skill when you:
- Create or restructure a module under `server/src/modules/<name>/`
- Add a new external integration (LLM, GitHub, git, embeddings, ...) under `server/src/adapters/<port>/`
- Wire a new dependency into `server/src/platform/container.ts`
- Review a PR/diff for layering violations (a `service.ts` importing `db/schema*.ts`, a Drizzle row type reaching `routes.ts`, `new SomeAdapter()` outside the container)
- Decide whether a module's business logic needs a dedicated `domain.ts` or can safely stay inside `service.ts`

This skill documents and *forces discipline around* a pattern the codebase already partially follows (see `references.md` "Project-specific note") — it does not introduce a new pattern from scratch.

## Quick Reference — the one rule that matters

> Dependencies always point inward. The Domain layer depends on nothing. Infrastructure and Presentation depend on Application/Domain — never the reverse.

| Layer | Repo location | Knows about |
|---|---|---|
| Domain (core) | `modules/<name>/domain.ts` (optional) | business rules only — zero framework/DB imports |
| Application | `modules/<name>/service.ts` | Domain types + **port interfaces** (not concrete adapters) |
| Infrastructure | `modules/<name>/repository.ts`, `adapters/<port>/*` | Drizzle, `db/schema*.ts`, SDKs, filesystem, network |
| Presentation | `modules/<name>/routes.ts` | Application (`service.ts`) + Zod request/response schemas |
| Composition root | `platform/container.ts` | everything — the one place allowed to construct concrete adapters |

## Recommended Reading Order

- **New module from scratch** -> `rules/layers.md` -> `rules/module-layout.md` -> `rules/dependency-injection.md`
- **New external integration (LLM, API, ...)** -> `rules/ports-and-adapters.md`
- **"Does this module need a `domain.ts`?"** -> `rules/domain-model.md`
- **Reviewing/refactoring an existing module** -> `rules/migration-checklist.md`
- **Writing tests for a layered module** -> `rules/testing.md`

## How to use

Read individual rule files for detailed explanations and repo-grounded examples:

- [rules/layers.md](rules/layers.md) — the four layers, the dependency rule, forbidden imports per layer
- [rules/module-layout.md](rules/module-layout.md) — mapping onto `modules/<name>/{routes,service,repository}.ts` + the Row-to-DTO mapping boundary
- [rules/ports-and-adapters.md](rules/ports-and-adapters.md) — `@devdigest/shared` port interfaces, `adapters/<port>/`, mocks
- [rules/dependency-injection.md](rules/dependency-injection.md) — `platform/container.ts` as the single composition root
- [rules/domain-model.md](rules/domain-model.md) — when a `domain.ts` earns its keep, anemic-model and overengineering pitfalls
- [rules/testing.md](rules/testing.md) — how layers map to unit vs `*.it.test.ts`
- [rules/migration-checklist.md](rules/migration-checklist.md) — step-by-step refactor checklist + a documented (not wired) `dependency-cruiser` gate proposal

Also see [examples.md](examples.md) (good/bad code grounded in this repo) and [references.md](references.md) (external sources).

## Core Principles

- **The Dependency Rule is the only hard rule.** Everything else (whether a module needs `domain.ts`, how granular a port is) is a judgment call — see `rules/domain-model.md`.
- **Ports are interfaces, adapters are implementations.** A service depends on the interface (`LLMProvider`, `AgentsRepository`); only `platform/container.ts` knows which concrete class backs it.
- **Persistence types stop at the repository boundary.** A Drizzle row (`AgentRow`, `*Row` from `db/rows.ts`) must be mapped to a domain/DTO type before it leaves `repository.ts` — never returned straight through `service.ts` to `routes.ts`.
- **Don't force a `domain.ts` on simple CRUD.** An anemic `service.ts` that just calls `repository.ts` is correct, not a violation, when there is no real business rule to protect.

## Enforcement

This skill is advisory (an AI agent / reviewer applies it while writing or reviewing code). `rules/migration-checklist.md` documents a `dependency-cruiser` rule that would make the "no DB types past `service.ts`" rule a hard build failure — `dependency-cruiser` is already a project dependency (used by `adapters/depgraph/` for the repo-intel import graph), so wiring it into `pnpm lint`/CI is a config change, not a new dependency. It is **not** currently wired in; that is a follow-up decision for the team.
