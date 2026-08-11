# Domain model — when to use `domain.ts`

Onion Architecture's most common failure mode isn't skipping the domain layer — it's adding one where it isn't needed. Judge each module on its own.

## When you don't need a `domain.ts`

Simple CRUD modules (`repos`, `settings`, `workspace`) where `service.ts` just validates input, calls `repository.ts`, and maps the result: **an anemic `service.ts` is correct here, not a violation.** Introducing a `domain.ts`, a bespoke entity class, or an extra port interface for a module that's four CRUD endpoints is overengineering — it adds indirection with no behavior to protect (see Victor Rentea, `references.md`).

## When you do

Extract business rules into `domain.ts` (plain functions/types, zero framework or DB imports) when:
- The same rule would otherwise be duplicated across multiple `service.ts` methods or modules.
- The rule is an invariant that must hold regardless of *how* it's invoked (HTTP route, CI runner, background job) — e.g. what makes an agent version "changed" (`agents/helpers.ts`'s `isConfigChange`), or the review grounding/scoring logic that already lives in `reviewer-core` precisely because it's framework-free, reusable core logic.
- You want to unit-test the rule without spinning up Fastify or Postgres.

## Anemic domain model — the trap to recognize

A domain model that is "just a bag of data" with all behavior pushed into a service is an anemic domain model. It's an acceptable default for CRUD, but a warning sign once `service.ts` grows into hundreds of lines mixing orchestration (call repo, call adapter, return) with actual business rules (validation, invariants, computed state) that don't depend on *how* the use case was triggered. When you see that mix, that's the signal to extract the rule-part into `domain.ts` — not to rewrite the whole module as rich entities.

## Overengineering — the other trap

Don't introduce a `domain.ts`, a port interface, *and* a dedicated repository for a module with no real business rule. Onion Architecture pays off in long-lived systems with genuine domain complexity; it actively hurts a five-endpoint settings module. When in doubt, start with `service.ts` + `repository.ts` (the module-layout.md default) and extract `domain.ts` only once a second use case needs the same rule.
