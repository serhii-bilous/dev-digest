# Migration checklist

Use this when refactoring an existing module to comply, or reviewing a diff before merge. Apply to the module(s) actually touched by the task — this skill does not ask for a repo-wide rewrite.

1. **Check for leaked persistence types.** `grep -n "Row" modules/<name>/service.ts` — if `service.ts` imports a `*Row` type from `repository.ts` and returns it (directly or nested) from an exported function, that's a violation.
2. **Add/extend the mapper.** Add a `toXDto(row: XRow): X` function in `helpers.ts` (mirror `agents/helpers.ts`'s `toAgentDto`/`toAgentVersionDto`) and route the repository result through it before it leaves `service.ts`.
3. **Check for adapter construction outside the container.** `grep -n "new .*Provider\|new Octokit\|new SimpleGit" modules/<name>/service.ts` — if found, move the construction into `platform/container.ts` and have `service.ts` call `container.<port>()` instead.
4. **Check for duplicated business rules.** If the same validation/invariant appears in two or more `service.ts` methods (or two modules), consider extracting to `domain.ts` — see `domain-model.md` for when this is worth it versus overengineering.
5. **Re-run the module's tests.** A pure layering refactor should not change behavior — `pnpm exec vitest run --exclude '**/*.it.test.ts'` and the module's `*.it.test.ts` should both still pass unchanged (aside from new unit tests you added for anything moved into `domain.ts`).

## Recommended (not wired) lint gate

The project already depends on `dependency-cruiser` (used by `adapters/depgraph/` to build the repo-intel import graph — see `server/src/adapters/depgraph/index.ts`), so adding a root-level rule to self-enforce the dependency rule is a config file, not a new dependency. This is a **proposal for the team to decide on**, not something this skill wires into `pnpm lint` or CI:

```js
// .dependency-cruiser.js (proposal — NOT currently wired into pnpm lint/CI)
module.exports = {
  forbidden: [
    {
      name: 'service-no-db',
      severity: 'error',
      comment:
        'Application layer (service.ts) must not import Drizzle schema/rows directly — ' +
        'route through repository.ts and map to a domain/DTO type in helpers.ts (see rules/module-layout.md).',
      from: { path: '^server/src/modules/[^/]+/service\\.ts$' },
      to: { path: '^server/src/db/(schema|rows)' },
    },
    {
      name: 'domain-no-infrastructure',
      severity: 'error',
      comment: 'Domain layer (domain.ts) must stay framework- and ORM-free.',
      from: { path: '^server/src/modules/[^/]+/domain\\.ts$' },
      to: {
        path: '(^server/src/(db|adapters)/|node_modules/(drizzle-orm|fastify|postgres))',
      },
    },
    {
      name: 'service-no-concrete-adapters',
      severity: 'warn',
      comment:
        'service.ts should depend on a port interface (@devdigest/shared), not a concrete adapter class. ' +
        'Construct adapters only in platform/container.ts.',
      from: { path: '^server/src/modules/[^/]+/service\\.ts$' },
      to: { path: '^server/src/adapters/' },
    },
  ],
};
```

If the team decides to activate this, wire `depcruise --config .dependency-cruiser.js server/src` into `server/package.json`'s `lint`/`test` script and CI — at that point escalate `service-no-concrete-adapters` from `warn` to `error` once existing modules are clean.
