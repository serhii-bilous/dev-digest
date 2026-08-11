# Module layout

## File -> layer mapping

| File | Layer | Notes |
|---|---|---|
| `routes.ts` | Presentation | Zod schemas for request/response; calls `service.ts` only |
| `service.ts` | Application | orchestrates the use case; optionally delegates to `domain.ts` |
| `domain.ts` (optional) | Domain | see `domain-model.md` for when this earns its keep |
| `repository.ts` (or `repository/*.repo.ts` when split, e.g. `reviews/repository/{pull,review,run,stats}.repo.ts`) | Infrastructure | the only file allowed to import `db/schema*.ts` |
| `helpers.ts` | boundary mapper | converts Infrastructure row types into Application/domain-facing types — see below |
| `constants.ts` | shared by any layer | pure values, no imports of its own |

## The mapping boundary (the pattern to copy)

`modules/agents/` already does this correctly — treat it as the reference implementation:

- `repository.ts` returns `AgentRow` / `AgentVersionRow` (the raw Drizzle row shapes from `db/rows.ts`).
- `helpers.ts` exports `toAgentDto(row: AgentRow): Agent` and `toAgentVersionDto(row: AgentVersionRow): AgentVersion` — these are the only functions in the module allowed to see both the Infrastructure row type and the Application-facing type.
- `service.ts` calls the repository, immediately maps through `helpers.ts`, and only ever holds/returns the mapped `Agent`/`AgentVersion` type. No Drizzle row escapes `service.ts`.

When adding a new module, replicate this: `repository.ts` returns rows, `helpers.ts` maps rows to DTOs, `service.ts` never re-exports a row type.

## Modules with a split repository directory

`reviews/repository/{pull,review,run,stats}.repo.ts` is the same Infrastructure layer, just partitioned per aggregate because the module owns several tables. The rule doesn't change: nothing outside `service.ts` imports from `repository/`, and none of the `.repo.ts` files' row types should be returned unmapped by `service.ts`.

## Composition inside a module

Cross-module shared repositories (`agentsRepo`, `skillsRepo`, `reviewRepo`) are constructed exactly once, in `platform/container.ts` (the composition root), and exposed as lazy getters (`container.agentsRepo`). A module's `service.ts` receives the `Container` and reads `container.agentsRepo` — it never does `new AgentsRepository(db)` itself. This is what lets `reviews` read agent data without owning agent construction logic, and what lets tests swap in a different `Db`/mock without touching `reviews`.
