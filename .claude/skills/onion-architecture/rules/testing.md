# Testing across layers

This maps directly onto the unit/integration split documented in `server/CLAUDE.md`: the split is by **filename** (`*.it.test.ts` = needs Docker), not by folder — which is exactly why layering discipline matters for testability.

| Layer | Test type | Why |
|---|---|---|
| `domain.ts` | plain unit test | pure functions, no I/O — the entire reason to extract it (see `domain-model.md`) |
| `service.ts` (orchestration logic) | unit test with mocked `Container`/repos/adapters | inject via `ContainerOverrides` + `adapters/mocks.ts`, no Docker needed |
| `repository.ts`, `adapters/<port>/*` | `*.it.test.ts` | hits real Postgres (`test/helpers/pg.ts`) or a real external API — must be named `*.it.test.ts` per the root gotcha or it silently runs in the wrong CI job |
| `routes.ts` | Fastify `.inject()` test | build the app with a `Container` using mocked adapters; asserts on HTTP status/body, not on DB state |

## Rule of thumb

If a test needs Docker or a real secret to pass, the code under test is Infrastructure and belongs in `*.it.test.ts`. If you find yourself wanting Docker to test something in `service.ts`, that's usually a symptom the layering already broke — business logic or a DB call leaked into a place it shouldn't be (check against `rules/layers.md`'s forbidden-imports table before adding infrastructure to a unit test).
