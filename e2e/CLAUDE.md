# e2e/ — CLAUDE.md

`@devdigest/e2e` — deterministic browser e2e via **agent-browser** (native
Rust+CDP CLI). Map only; see `README.md` for how a flow works and coverage.

## Stack
`agent-browser` CLI (no Playwright, no LLM, no API key) · plain JSON flow specs.

## Commands
```
./scripts/e2e.sh                    # hermetic: isolated Postgres/API/web on alt ports, seeded fresh
cd e2e && npm test                  # against your own running dev stack (see precondition below)
```

## Map
- `specs/NN-name.flow.json` — **this is where the flows themselves live**, not
  feature specs. Each file is an ordered list of `agent-browser` commands +
  deterministic assertions (`wait --text` / `wait --url`).
- `run.ts` — executes one shared browser session across all flow files.
- `lib/assert.ts` — shared assertion helpers.

## Read when
- Writing/debugging a flow → `README.md` ("How a flow works" + the precondition warning).
- A flow needs new coverage → add a `specs/NN-name.flow.json`, update the coverage table in `README.md`.
- A gotcha not obvious from a flow's JSON → `INSIGHTS.md`.
- Finishing a task with a non-obvious lesson → capture it via
  `.claude/skills/engineering-insights` (or run `/engineering-insights`);
  treat existing `INSIGHTS.md` entries as high-confidence guidance before
  starting related work.

## Gotchas
- Flows 02/04/05 assume the seeded demo repo (`acme/payments-api`) is the
  **only** repo in the DB — running against a dev DB with other imported
  repos makes them fail on the wrong repo. Use the hermetic runner, not your
  personal dev stack, unless you know your DB only has the seed data.
- Never `docker compose down -v` to "reset" — `-v` deletes the persistent
  `devdigest_pgdata` volume (every real repo/review you've imported), not
  just the e2e run's state.

## Do-not-touch
- No `chat`/AI locator commands — flows must stay deterministic and key-free;
  don't introduce a non-deterministic locator to fix a flaky step.
