# Implementation plan: Stack-aware agents (agent ↔ repository compatibility) + built-in Python reviewers

**Execution mode:** multi-agent (chosen by the user)
**Requirements source:** `specs/2026-10-27-stack-aware-agents.md` (amended version, re-read in full). This plan only reads it and never modifies it.
**Spec ID:** SPEC-2026-10-27-stack-aware-agents

## Overview
Each repository gets a GitHub language breakdown with `known | stale | unknown` status. Each agent declares `any` or a list of linguist names. A deterministic ≥10% rule hides incompatible agents and stops them running, and the client, the API and MCP all enforce it. The global `enabled` flag gives way to opt-in per-(repo, agent) state, where a missing row means inactive. `/agents` splits into "Active on <repo>" (Remove) and "Available to add" (Add). Four Python built-ins are seeded, and the existing four built-ins are tagged `[TypeScript, JavaScript]`.

## Assumptions
- **Spec status:** spec line 5 still says "Needs re-approval". The coordinator reports the user re-approved it, so I planned against it as approved.
- **Branch:** `feat/LAB5-stack-aware-agents`. The TAG is taken from the current branch's lesson tag; rename it if this belongs to another lesson.
- **Where acceptance tests run (NFR-10):** the acceptance tests are hermetic service/unit tests using stubbed repositories, `MockGitHubClient` and `vi.useFakeTimers()`. This follows the stub-cast pattern in `server/INSIGHTS.md` 2026-08-13. Only the migration test and the seed test use the DB lane (`*.it.test.ts`).
  - AC-24 (cascades) is DB behaviour, so it is asserted in the migration/schema `.it` test.
- **Never-fetched repos:** `Repo.stack` is `null` for a repo whose languages were never attempted. That can only happen before the first trigger; AC-3 fetches before any compatibility answer.
- **Adding an incompatible agent:** `PUT /agents/:id/repos/:repoId {active:true}` for an incompatible agent returns 409 `agent_incompatible`, the same error shape as AC-35. The UI can't reach this, but the API stays consistent. `{active:false}` is always allowed.
- **Storage choices:**
  - `agents.languages`: nullable jsonb `string[]`, where `NULL` means `any`.
  - `repos` gets four new columns:
    - `languages` jsonb: the raw map from the last successful fetch;
    - `languages_fetched_at`;
    - `languages_attempted_at`;
    - `languages_failure`: the failure reason, or null.
  - Status is derived from these columns in pure code. `no_code_languages` is derived from a successful map with no code entries, so it is never stored as a failure.
- **Seeding scope:** the built-ins and their skills are seeded into every workspace. The demo repo, demo PR and settings stay in the `default` workspace only.

## Accepted recommendations
- **R1 (inverted):** per-(repo, agent) state in `repo_agent_states`. A missing row means **inactive**. Compatibility is computed at read time, with no re-evaluation writer. → Steps 2, 4
- **R2:** `agents.enabled` stays in the DB, is no longer read, and leaves the contract. → Steps 1, 2
- **R3:** one generated DDL migration plus one hand-written data migration, and a test helper that migrates "up to" a tag. → Step 2
- **R4 and R5:** pure rules in `server/src/platform/stack-compat.ts`; a new `server/src/modules/repo-stack/` module exposed through the container; `GitHubClient.getLanguages` on the port. → Steps 1, 4
- **R7:** the 409 puts its data under `error.details`. → Step 6
- **R8:** the seed tags a Python-named agent only while its declaration is `any`; the one-time tagging happens in the migration. → Steps 2, 3
- **R9:** the client gets local accessible Add/Remove buttons. The per-card toggle is gone, so the vendored `Toggle` is no longer used on `/agents`. → Step 9
- **R10:** Python prompts are authored from the live API, with `docs/agent-prompts/*-python.md` mirrors added afterwards. → Steps 3, 13
- **R6 is replaced by this API shape,** which hangs off the existing resources instead of a single new endpoint:
  - `GET /agents?repo=<repoId>` → `RepoAgent[]`: compatible agents only, each with `active` and `compatible`. Without `?repo`, it returns `Agent[]` as before.
  - `GET /agents/:id?repo=<repoId>` → `RepoAgent`, where `compatible` may be `false`. This is the deep-link read for AC-31.
  - `PUT /agents/:id/repos/:repoId` with body `{ active: boolean }` → `RepoAgent`. This is Add/Remove.
  - `GET /repos/:id/stack` → `RepoStack`. It is an AC-3/AC-44 trigger and shares the in-flight fetch (NFR-3).
  - `POST /repos/:id/stack/refresh` → `RepoStack`. This is Retry, and it bypasses the cooldown.
  - `POST /repos` → `Repo` with `stack`. `POST /repos/:id/refresh` → `{ status: 'refreshing', stack }`. Both await the fetch inline.

## Module impact map
- **`server/src/vendor/shared` and `client/src/vendor/shared` (`@devdigest/shared`):**
  - Changes: `Agent.languages` (`enabled` removed); `AgentVersionConfig.languages`; `RepoStack*`; `Repo.stack`; `RepoAgent`; `RepoRefreshResponse`; `RunTrace.repo_stack`; `GitHubClient.getLanguages`.
  - Checked: root INSIGHTS on the hand-copied client vendor drift, and on Zod as the single source of truth.
- **`server/src/db`:** schema, migrations 0016 (DDL) and 0017 (data), seed, seed prompts.
  - Checked: `server/INSIGHTS.md` on the three-step migration rule, the drop+add rename prompt, journal hazards, and migrations not running on boot. The Docker entrypoint does run them.
- **`server/src/platform`:** new `stack-compat.ts` (pure rules) and a `container.ts` accessor.
  - Checked: the root INSIGHTS entry on the `no-cross-module-internals` precedent (`project-context.ts`).
- **`server/src/adapters`:** `github/octokit.ts` and `mocks.ts` get `getLanguages`.
- **`server/src/modules/repo-stack/` (new):** fetch, cooldown, in-flight dedupe, evaluation, per-repo state, and the stack routes.
- **`server/src/modules/agents`:** `languages`, `?repo` reads, Add/Remove route.
- **`server/src/modules/repos` and `polling`:** inline fetch on add, refresh and poll; `stack` in the DTO.
- **`server/src/modules/reviews`:** `resolveTargets` filters by active ∧ compatible, returns the 409, and records the trace snapshot.
  - Checked: `server/INSIGHTS.md` 2026-08-22 on `resolveTargets` and uuid validation.
- **`client/src`:**
  - hooks, shell repo switching, the new `LanguageBadge` component, the `/agents` page sections and header/notice, the editor header and Languages field, `RunReviewDropdown`, and `messages/en/*.json`;
  - no client specs/docs for this area; `client/INSIGHTS.md` exists.
- **`mcp-server/src`:** `list_agents` gets `repo` and `languages`; `resolveRepo` accepts an id; a test for `run_agent_on_pr`'s 409 handling. No mcp-server specs.
- **`e2e/specs`:** update `03-agents.flow.json` and add a new sections/badge flow.
- **`docs/agent-prompts/`:** Python mirrors.

## Architecture notes
These follow the `onion-architecture` skill.
- **Domain (pure):** `platform/stack-compat.ts`:
  - `NON_CODE_LANGUAGES`;
  - `codeLanguages(map)` → `{name, bytes, percent}[]`, highest first;
  - `deriveStack(row)` → `RepoStack | null`;
  - `isCompatible(decl, stack)`, case-insensitive and ≥10%, with `unknown` → always compatible;
  - `resolveEntries(agents, states, stack)` → `{agent, compatible, active}` (`active` = the stored row's value or `false`);
  - `diffCompatible(before, after, agents)` for the NFR-11 log;
  - `classifyFetchError(err)` → `no_token | no_access | unreachable`.

  It lives in `platform/` because `agents`, `repos` and `reviews` all need it, and `no-cross-module-internals` stops one module importing another module's helpers.
- **Infrastructure:**
  - `OctokitGitHubClient.getLanguages` uses `repos.listLanguages` with no `withRetry`; the service owns the 5 s cap.
  - `RepoStackRepository` (Drizzle) handles the stack columns and `repo_agent_states`.
- **Application:** `RepoStackService`:
  - `ensure(ws, repoId, {force})`: in-flight `Map<repoId, Promise>`; the 10-min cooldown is read from `languages_attempted_at`; `withTimeout(5000)`; logs NFR-11.
  - `getStack`, `evaluate(ws, repoId)` → `{stack, entries}` (calls `ensure`), `setActive`, `afterPollSuccess`.
  - It reads agents through `container.agentsRepo`. It never builds `Agent` DTOs; the agents module maps rows with its own `toAgentDto`.
- **Composition root:** a `container.repoStack` getter (lazy, like `agentsRepo`). The routes are registered in `src/modules/index.ts`.
- **Presentation:**
  - agents routes: `?repo`, PUT;
  - repo-stack routes: GET stack, POST refresh;
  - the repos and polling routes call the service.
  - Validation errors stay on the app-wide 422 handler. The 409 is `AppError('agent_incompatible', msg, 409, {agent_languages, repo_languages})`.

## Steps

### Step 1 — Shared contracts + keep both packages compiling
- **Domain**: backend + frontend (contract)
- **Module(s)**: `server/src/vendor/shared`, `client/src/vendor/shared`, plus mechanical consumer fixes
- **Files likely touched**:
  - both copies of `contracts/knowledge.ts`, `contracts/platform.ts`, `contracts/trace.ts` and `adapters.ts`;
  - `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`;
  - `server/src/modules/agents/{helpers,routes,service}.ts`;
  - `client/src/lib/hooks/agents.ts`, `client/src/app/agents/_components/AgentCard/AgentCard.tsx`, `client/src/app/agents/_components/AgentsListView/AgentsListView.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx`, `client/src/app/agents/[id]/page.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx`;
  - the agent test fixtures (`AgentCard.test.tsx`, `AgentEditor.test.tsx`, `RunReviewDropdown.test.tsx`).
- **Covers**: AC-10 (contract), AC-14 (schema), AC-35 (error-details shape), NFR-6 (reason enum); infra for everything else
- **Required skills**: zod, typescript-expert
- **Depends on**: none
- **Can run in parallel with**: none (contract-first gate)
- **What to do**:
  1. Add the following, identically in both vendored copies:
     - `AgentLanguages = z.union([z.literal('any'), z.array(z.string().min(1).max(50)).min(1).max(20)])`;
     - on `Agent`: `languages: AgentLanguages.default('any')`, with `enabled` **removed**;
     - `AgentVersionConfig.languages` (default `'any'`);
     - `RepoStackStatus`, `RepoStackReason`, `RepoLanguage {name, bytes, percent}`, `RepoStack {status, reason?, languages, fetched_at?, last_attempt_at?}`;
     - `Repo.stack: RepoStack.nullable().optional()`;
     - `RepoAgent = Agent.extend({ compatible, active })`, `SetRepoAgentActiveInput {active}`, `RepoRefreshResponse {status:'refreshing', stack}`, `AgentIncompatibleDetails {agent_languages, repo_languages}`;
     - `RunTrace.repo_stack: z.object({status, languages: RepoLanguage[]}).nullish()`;
     - on `GitHubClient`: `getLanguages(repo): Promise<Record<string, number>>`.
  2. Implement `getLanguages` in Octokit and in `MockGitHubClient`. The mock takes a configurable map or error plus a call counter.
  3. Make the minimal consumer changes so `server` and `client` typecheck green:
     - remove `enabled` from `toAgentDto`, the create/update bodies and the service inputs;
     - map `languages` in `toAgentDto` (`null` → `'any'`); the column comes in Step 2, so read it defensively here or land this together with Step 2's schema field;
     - on the client, delete the card `Toggle`, the ConfigTab enabled toggle, the editor "disabled" badge and RunReviewDropdown's `enabled` hint, and update the fixtures.

  These are temporary simplifications that later steps replace.
- **Acceptance criteria**:
  - both shared copies are byte-identical for the touched files (`diff -q`);
  - `pnpm typecheck` is green in `server/` and `client/`;
  - `AgentLanguages` rejects `[]`, 21 names and a 51-character name.

  Note: `agents.languages` is added by Step 2. In Step 1, `toAgentDto` emits `languages: 'any'` until Step 2 lands.

### Step 2 — DB schema, migrations, migration test
- **Domain**: backend
- **Module(s)**: `server/src/db`, `server/test`
- **Layer**: infrastructure
- **Files likely touched**: `server/src/db/schema/{agents,repos}.ts`, a new `repo_agent_states` table (in `schema/agents.ts` or a new `schema/repo-stack.ts` re-exported from `schema.ts`), `server/src/db/rows.ts`, `server/src/db/migrations/0016_*.sql` (generated), `server/src/db/migrations/0017_*.sql` (custom), `meta/*`, `server/test/helpers/pg.ts` (add `startPgUpTo(tag)`), `server/test/stack-aware-migration.it.test.ts`, `server/src/modules/agents/helpers.ts` (`toAgentDto` reads `languages`)
- **Covers**: AC-10, AC-18, AC-19, AC-24, AC-47a (migration half), AC-53
- **Required skills**: drizzle-orm-patterns, postgresql-table-design, onion-architecture
- **Depends on**: Step 1
- **Can run in parallel with**: Step 7, Step 12
- **What to do**:
  1. Add to the schema:
     - `agents.languages` jsonb `$type<string[] | null>()`, nullable;
     - on `repos`: `languages` jsonb `$type<Record<string,number>|null>`, `languagesFetchedAt`, `languagesAttemptedAt` (timestamptz) and `languagesFailure` (text, nullable);
     - `repo_agent_states(repo_id → repos ON DELETE CASCADE, agent_id → agents ON DELETE CASCADE, active boolean not null, updated_at)`, with PK `(repo_id, agent_id)` and an index on `agent_id`.

     **Do not drop `agents.enabled`.**
  2. Run `cd server && pnpm db:generate` for 0016. It must be purely additive, so check that no rename prompt appears.
  3. Run `pnpm exec drizzle-kit generate --custom --name stack_aware_backfill` for 0017 and write:
     ```sql
     UPDATE agents SET languages = '["TypeScript","JavaScript"]'
       WHERE name IN ('General Reviewer','Security Reviewer','Performance Reviewer','Test Quality Reviewer');
     UPDATE agents SET languages = '["Python"]'
       WHERE name IN ('General Reviewer (Python)','Security Reviewer (Python)','Performance Reviewer (Python)','Test Quality Reviewer (Python)');
     INSERT INTO repo_agent_states (repo_id, agent_id, active)
       SELECT r.id, a.id, a.enabled FROM repos r JOIN agents a ON a.workspace_id = r.workspace_id
       ON CONFLICT DO NOTHING;
     ```
     Every other agent stays `NULL`, which means `any`.
  4. Verify that `_journal.json` only appended entries 16 and 17 (see the journal-rewrite insight).
  5. Add a test helper that copies `src/db/migrations` to a temp dir with the journal cut after `0016`, migrates, inserts fixtures, then runs the full `runMigrations`.
  6. Write `stack-aware-migration.it.test.ts`:
     - an `enabled=false` agent → inactive rows on every existing repo, and `enabled=true` → active;
     - renamed built-in and custom agents → `NULL`/`any`;
     - "Security Reviewer (Python)" → `[Python]` with its original prompt;
     - deleting a repo or an agent leaves no orphaned `repo_agent_states` rows.
- **Acceptance criteria**: AC-19, AC-53 and AC-47a (migration half) are asserted in the DB lane; AC-24 cascades are asserted; the migration is purely additive on a DB with live data.

### Step 3 — Python prompts + seed
- **Domain**: backend
- **Module(s)**: `server/src/db`
- **Layer**: infrastructure (fixture data)
- **Files likely touched**: `server/src/db/seed-prompts.ts`, `server/src/db/seed.ts`, `server/test/seed-prompts-python.test.ts`, `server/test/seed-stack-aware.it.test.ts`
- **Covers**: AC-46, AC-47, AC-47a (seed half), AC-47b, AC-47c, AC-47d, AC-48, AC-49, AC-50, AC-51, AC-52
- **Required skills**: drizzle-orm-patterns
- **Depends on**: Step 2
- **Can run in parallel with**: Step 4, Step 8, Step 9 — disjoint files
- **What to do**:
  1. **Prompts.** Fetch the four live "(Python)" agents with `curl http://localhost:3001/agents`, then `GET /agents/:id`; the Docker stack must be up. Build `GENERAL_REVIEWER_PYTHON_PROMPT`, `SECURITY_REVIEWER_PYTHON_PROMPT`, `PERFORMANCE_REVIEWER_PYTHON_PROMPT` and `TEST_QUALITY_REVIEWER_PYTHON_PROMPT`:
     - strip the myTube-specific stack block (the `_stack.md` content);
     - scrub every Node.js, TypeScript and ESM mention from the General prompt;
     - make sure each prompt contains the AC-48–51 topics: Python 3, typing, exceptions, `asyncio`; `eval`/`exec`, `pickle`, `yaml.load`, `subprocess` `shell=True`, SQL string formatting, `requests` SSRF, secrets; Django ORM/SQLAlchemy N+1, blocking calls in async, hot loops, materialisation; pytest fixtures, `parametrize`, `unittest.mock`/`monkeypatch` overuse, missing assertions, flaky time/randomness/ordering.

     If the API is unreachable, write the prompts from scratch to AC-48–51, mirroring the structure of the existing Node prompts.
  2. **Seed.**
     - Loop over **every** workspace for the skills, built-in agents and the Test Quality skill link. The demo repo, PR and settings stay in `default`.
     - Insert the four TS/JS built-ins with `languages: ['TypeScript','JavaScript']`, and the four Python built-ins with `['Python']`, `DEFAULT_PROVIDER`/`DEFAULT_MODEL` and repo-intel on (the default). Link Test Quality Reviewer (Python) to `pr-quality-rubric` only.
     - Stay idempotent by name per workspace.
     - For an existing Python-named agent whose `languages IS NULL`, set `['Python']`. Never touch any other agent's declaration.
     - Create no `repo_agent_states` rows, except when this run **creates** `acme/payments-api`: record that flag, and after the built-ins exist, insert active rows for the four TS/JS built-ins with `onConflictDoNothing`.
  3. **Tests.**
     - `seed-prompts-python.test.ts` (unit): text assertions for AC-48–51.
     - `seed-stack-aware.it.test.ts`:
       - two workspaces, seed run twice → one row per built-in name per workspace;
       - a pre-existing API-created "General Reviewer (Python)" stays a single row with its original prompt;
       - `[Python, Go]` stays unchanged, and an `any` one becomes `[Python]`;
       - a seed-created Python agent has no state row;
       - on a fresh DB the demo repo has four active TS/JS built-ins; remove one, re-seed → it stays inactive;
       - a fresh seed gives the TS/JS built-ins `["TypeScript","JavaScript"]`.
- **Acceptance criteria**: as covered above.

### Step 4 — Pure rules + repo-stack module + container wiring
- **Domain**: backend
- **Module(s)**: `server/src/platform`, `server/src/modules/repo-stack` (new)
- **Layer**: domain (`stack-compat.ts`), infrastructure (repository), application (service), presentation (routes), composition root (container, `modules/index.ts`)
- **Files likely touched**: `server/src/platform/stack-compat.ts`, `server/src/modules/repo-stack/{repository,service,routes,constants}.ts`, `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/test/stack-compat.test.ts`, `server/test/repo-stack-service.test.ts`
- **Covers**: AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-15, AC-16, AC-17, AC-18, AC-18a, AC-29 (server), AC-37, AC-38, AC-39 (list), AC-40, AC-41, AC-42, AC-44, NFR-1, NFR-2, NFR-3, NFR-4, NFR-6, NFR-11
- **Required skills**: onion-architecture, fastify-best-practices, drizzle-orm-patterns, typescript-expert, security
- **Depends on**: Step 2
- **Can run in parallel with**: Step 3, Step 8, Step 9
- **What to do**: implement the Architecture-notes design. Specifics:
  - **Exclusions:** the AC-4 list, matched case-insensitively.
  - **Threshold:** `percent >= 10`, computed on unrounded values. Expose a rounded `percent` in the DTO.
  - **Fetch outcomes:**
    - success with code languages → store the map, `fetched_at`, `attempted_at`, `failure = null`;
    - success with no code languages → replace the map; the derived status is `unknown/no_code_languages` (AC-8);
    - failure → set `failure` and `attempted_at`, and keep the map (`stale` if it still has code languages, else `unknown`).
  - **Error mapping:** a `ConfigError` from `container.github()` → `no_token`; Octokit `status` 403/404 → `no_access`; anything else, including the 5 s timeout → `unreachable`.
  - **When to fetch:**
    - `attempted_at` null → fetch;
    - status `unknown` and `attempted_at` older than 10 min → fetch;
    - `force` → always fetch.
  - **In-flight:** the in-flight Map is keyed by repoId and cleared in `finally`.
  - **Logging and secrets:** one `info` log per completed fetch with `full_name`, outcome and reason, plus `became_compatible`/`became_incompatible` counts when non-zero (diffed across the workspace's agents). Never log or store the token, and never include raw error messages from Octokit in the log.
  - **Workspace scope:** every method takes `workspaceId` and 404s on a foreign repo or agent (NFR-7).
  - **Routes:** `GET /repos/:id/stack` and `POST /repos/:id/stack/refresh`.
  - **Poll hook:** `afterPollSuccess(ws, repoId)` fetches with `force` when the derived status is `unknown` or never attempted.
  - **Tests (hermetic):** stub the repository via casts, use `MockGitHubClient` with a call counter and fake timers. Cover every AC/NFR listed above, including:
    - two concurrent `ensure` → 1 call;
    - a never-resolving stub → `unreachable` at 5 s;
    - cooldown at 1 min vs 10 min;
    - a stored breakdown → 0 calls;
    - restore/keep/absent → inactive logic (AC-40–42) in `stack-compat.test.ts`.
- **Acceptance criteria**: as covered above. No path in `ensure` throws; failures always resolve to a stack.

### Step 5 — Agents module: languages, repo-scoped reads, Add/Remove
- **Domain**: backend
- **Module(s)**: `server/src/modules/agents`
- **Layer**: application + presentation
- **Files likely touched**: `server/src/modules/agents/{repository,service,routes,helpers}.ts`, `server/test/agents-repo-scope.test.ts`
- **Covers**: AC-10, AC-11, AC-12 (server), AC-13, AC-14, AC-17, AC-21, AC-22 (server), AC-25 (server filter), AC-31 (server read), NFR-7
- **Required skills**: onion-architecture, fastify-best-practices, zod
- **Depends on**: Step 4
- **Can run in parallel with**: Step 6, Step 10
- **What to do**:
  - Add `languages: AgentLanguages.optional()` to the create/update bodies (validation failures → existing 422 `validation_error`). Store `'any'` as `NULL`.
  - Add `languages` to `isConfigChange` (compare normalised) and to the `snapshotVersion` `config_json`.
  - `create` writes no state rows (AC-21).
  - Remove the `listEnabled` call sites from this module.
  - Routes:
    - `GET /agents?repo=<uuid>` → `container.repoStack.evaluate` → compatible entries mapped by `toAgentDto` + `{compatible, active}`;
    - `GET /agents/:id?repo=` → a single entry, including when incompatible;
    - `PUT /agents/:id/repos/:repoId {active}` → `setActive` (409 `agent_incompatible` when activating an incompatible agent) → `RepoAgent`.

    The `repo` query is validated as a uuid (see the INSIGHTS entry on raw uuid errors).
  - Hermetic tests:
    - schema parse for the AC-14 limits, plus the 422 mapping via the existing error handler contract;
    - a `languages` change bumps the version and the snapshot includes it;
    - create without `languages` → `'any'`;
    - a new agent is `active:false`;
    - Add on repo A doesn't touch repo B;
    - a foreign workspace → 404;
    - changing languages is reflected on the next evaluation with no refresh.
- **Acceptance criteria**: as covered above.

### Step 6 — Repos, polling, reviews: inline fetch, run gating, 409, trace snapshot
- **Domain**: backend
- **Module(s)**: `server/src/modules/{repos,polling,reviews}`
- **Layer**: application + presentation
- **Files likely touched**: `server/src/modules/repos/{service,helpers,routes}.ts`, `server/src/modules/polling/routes.ts`, `server/src/modules/reviews/{service,routes,run-executor}.ts`, `server/test/repos-stack.test.ts`, `server/test/reviews-compat.test.ts`, `server/test/run-executor.test.ts`
- **Covers**: AC-1, AC-2, AC-3 (run path), AC-20, AC-32, AC-34 (server: a single inactive compatible agent runs), AC-35, AC-36, AC-39 (runs), AC-43, NFR-4, NFR-5, NFR-12
- **Required skills**: onion-architecture, fastify-best-practices, security
- **Depends on**: Step 4
- **Can run in parallel with**: Step 5, Step 10
- **What to do**:
  - `RepoService.add`: after insert, `await container.repoStack.ensure(ws, id, {force:true})`, and return the DTO with `stack`. An existing repo returns its current stack.
  - `refresh`: enqueue as today, then force a fetch, and return `{status:'refreshing', stack}`.
  - `toRepoDto` adds `stack: deriveStack(row)`.
  - Polling: after a successful sync, `await container.repoStack.afterPollSuccess(...)`, wrapped so a stack failure never fails the poll.
  - `resolveTargets(ws, prId, opts)`:
    - load PR → repo → `evaluate`;
    - `all` → entries that are `active && compatible` (may be `[]` → `runReview` returns `runs: []`);
    - single agent → 404 when missing; if incompatible, throw `AppError('agent_incompatible', …, 409, { agent_languages, repo_languages })` before any `createAgentRun`;
    - return the stack snapshot.
  - Pass the snapshot through `runReview` → `executeRuns` jobs → `RunTrace.repo_stack` at **both** trace build sites (the normal path and `traceFromBuffer`).
  - Update the route call site.
  - Hermetic tests:
    - add/refresh responses carry `known` with a stubbed map, and a newer `fetched_at` on refresh;
    - a fresh repo → `{all:true}` gives `runs: []`;
    - a Python repo `{all:true}` runs only active Python/`any` agents;
    - incompatible single → 409 with details and zero `createAgentRun` calls;
    - unknown→known Python hides TS agents from `all`;
    - an unknown repo + a successful poll → one languages call → `known`;
    - a failing stub gives no throws/5xx from add, refresh, poll or run;
    - `MockLLMProvider` call count is unchanged by stack logic;
    - the trace contains `repo_stack.languages`.
- **Acceptance criteria**: as covered above.

### Step 7 — Client foundation: hooks, LanguageBadge, shell switching, strings
- **Domain**: frontend
- **Module(s)**: `client/src/lib`, `client/src/components`, `client/messages/en`
- **Files likely touched**:
  - `client/src/lib/hooks/agents.ts`, a new `client/src/lib/hooks/repo-stack.ts`, `client/src/lib/hooks/core.ts` (`useAddRepo`/`useRefreshRepo` types + invalidation), `client/src/lib/hooks/index.ts`;
  - `client/src/components/agents/LanguageBadge/{LanguageBadge.tsx,helpers.ts,styles.ts,index.ts,LanguageBadge.test.tsx}`;
  - `client/src/components/app-shell/hooks/useShellContext.ts`, `client/src/components/app-shell/helpers.ts`, a new `useShellContext.test.tsx`;
  - `client/messages/en/agents.json`.
- **Covers**: AC-26a, AC-45 (invalidation), AC-58/59/63 (component), NFR-8 (badge), NFR-9 (badge contrast/text)
- **Required skills**: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library
- **Depends on**: Step 1
- **Can run in parallel with**: Step 2, Step 12
- **What to do**:
  - Hooks:
    - `useRepoAgents(repoId)` with key `["agents","repo",repoId]` (prefix-invalidated by existing `["agents"]` invalidations);
    - `useRepoAgent(agentId, repoId)` with key `["agents","repo",repoId,agentId]`;
    - `useRepoStack(repoId)` with key `["repo-stack",repoId]`;
    - `useSetRepoAgentActive()`: optimistic update of `["agents","repo",repoId]`, rollback `onError`, invalidate on settle;
    - `useRetryRepoStack()`: on success, set `["repo-stack",id]` and invalidate `["agents"]`;
    - add `languages` to `UpdateAgentInput`;
    - `useAddRepo`/`useRefreshRepo` also invalidate `["repo-stack"]` and `["agents"]`.
  - `LanguageBadge`:
    - plain text (no `dangerouslySetInnerHTML`);
    - `"Any language"` for `any`;
    - up to 3 names joined by `" · "`, then `" +N"`;
    - `aria-label` and `title` = the full list;
    - colours from existing tokens that meet 4.5:1;
    - `flex-shrink: 0`.
  - Shell: when `activeKeyFor(pathname)` is the agents page (`/agents` or `/agents/:id`), `onSelectRepo` only calls `setRepoId`; otherwise it keeps today's navigation.
  - Strings: put **all** new `agents` namespace strings here (section headings, the AC-25a empty state, Add/Remove labels and accessible names, stack header/notice/reasons, Retry, the no-repo hint, the editor "not compatible" note, the Languages field) so later client steps never edit this file.
- **Acceptance criteria**: AC-26a (path stays `/agents`, `setRepoId` called); badge tests for "TypeScript · JavaScript", "Any language", "A · B · C +2" with the full accessible name, and `<img src=x>` rendered literally.

### Step 8 — `/agents` page: sections, Add/Remove, stack header and notice
- **Domain**: frontend
- **Module(s)**: `client/src/app/agents/_components`
- **Files likely touched**: `AgentsListView/{AgentsListView.tsx,helpers.ts,styles.ts,AgentsListView.test.tsx}`, new `AgentsListView/_components/{StackHeader,StackNotice,AgentSection}/**`, `AgentCard/{AgentCard.tsx,styles.ts,AgentCard.test.tsx}`
- **Covers**: AC-22, AC-22a, AC-23, AC-23a, AC-25, AC-25a, AC-26, AC-27, AC-28, AC-29 (client), AC-30, AC-45, AC-58, AC-59, AC-60, NFR-8, NFR-9
- **Required skills**: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library
- **Depends on**: Step 7
- **Can run in parallel with**: Step 3, Step 4, Step 9
- **What to do**:
  - Data: `useActiveRepo()` → `useRepoAgents(repoId)` + `useRepoStack(repoId)`.
  - Header: repo full name, the top 5 code languages "Python 90% · TypeScript 10%" (+N more), and the fetched time.
  - `StackNotice` (`role="status"`) for unknown/stale, with the reason text and a Retry `button` (disabled + busy while pending; focus stays on it after completion). The grid always renders.
  - Two sections with headings:
    - "Active on <full name>": Remove buttons, or the AC-25a empty state;
    - "Available to add": Add buttons.
  - Each button:
    - accessible name "Add <agent> to <repo>" / "Remove <agent> from <repo>";
    - disabled + busy while its mutation is pending;
    - on success, focus moves to the same agent's button in its new section (ref map keyed by agent id);
    - on error, the optimistic move is rolled back and an inline error message is shown.
  - `AgentCard`: drop the toggle props; accept an `action` slot (the Add/Remove button) and render `LanguageBadge` in the header row. Only the name truncates (`minWidth:0; overflow:hidden; textOverflow:ellipsis`); the badge and button don't shrink.
  - No repo → a single list of all agents (`useAgents`) with no buttons, plus the "Import a repository to add agents to it" hint.
  - Search filter applies within both sections.
- **Acceptance criteria**: client tests for each listed AC by RTL role/name, including:
  - no `switch` role present;
  - a 120-character name keeps the badge text whole;
  - a failing mutation restores the section;
  - Retry success invalidates the list and the notice disappears;
  - a Python repo shows no TS-tagged agents;
  - changing the active repo changes both sections.

### Step 9 — Agent editor: header badge, Languages field, incompatible note
- **Domain**: frontend
- **Module(s)**: `client/src/app/agents/[id]`
- **Files likely touched**: `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `.../AgentEditor.test.tsx`, `.../_components/ConfigTab/{ConfigTab.tsx,constants.ts,styles.ts}`, a new `.../ConfigTab/ConfigTab.test.tsx`
- **Covers**: AC-12 (client), AC-31, AC-61, AC-62, NFR-9 ("not compatible" as text)
- **Required skills**: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library
- **Depends on**: Step 7
- **Can run in parallel with**: Step 3, Step 4, Step 8
- **What to do**:
  - The editor header renders `LanguageBadge` from the `useAgent` data, which `useUpdateAgent` already updates via `setQueryData`.
  - When an active repo exists, `useRepoAgent(id, repoId)`; if `compatible === false`, show a text note "Not compatible with <repo full name>" and still render the editor.
  - ConfigTab Languages field:
    - an "Any language" choice, or a list editor with suggestions (Python, TypeScript, JavaScript, Go, Java, Ruby, Rust, C#, PHP, Kotlin, Swift, C, C++);
    - custom names allowed;
    - client-side limits mirror the contract;
    - included in the save diff, sending `languages` in the PUT.
- **Acceptance criteria**:
  - a `[Python]` agent's header shows "Python";
  - edit to any → save → the header (and, through `["agents"]` invalidation, the card) shows "Any language";
  - the deep link with a TS repo active shows the editor plus the note;
  - the save payload contains `languages`.

### Step 10 — PR "Run review" menu
- **Domain**: frontend
- **Module(s)**: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown`
- **Files likely touched**: `RunReviewDropdown.tsx`, `RunReviewDropdown.test.tsx`, `client/messages/en/prReview.json` (if it exists; else the existing prReview namespace file)
- **Covers**: AC-33, AC-34, AC-36 (client), NFR-9 ("inactive" as text)
- **Required skills**: react-best-practices, react-testing-library
- **Depends on**: Step 7
- **Can run in parallel with**: Step 5, Step 6
- **What to do**:
  - Use `useRepoAgents(<PR's repoId>)`. The component receives `repoId` from its parent, or reads the `[repoId]` route param.
  - Items:
    - active → hint = model;
    - inactive → hint `"<model> · inactive"`, still clickable for a single run.
  - "Run all" is muted with the spec's tooltip text when no item is active.
  - Show the 409 error message from a stale client (AC-35) through the existing mutation error path.
- **Acceptance criteria**: TS agents are absent on a Python repo; the "inactive" hint text is shown and a click calls a single-agent run; "Run all" is muted when nothing is active.

### Step 11 — (placeholder number unused; see Step 12/13)

### Step 12 — MCP: `list_agents` repo/languages, `run_agent_on_pr` 409
- **Domain**: backend (mcp-server)
- **Module(s)**: `mcp-server/src`
- **Files likely touched**: `mcp-server/src/tools/list-agents.ts`, a new `mcp-server/src/tools/list-agents.test.ts`, `mcp-server/src/tools/run-agent-on-pr.test.ts`, `mcp-server/src/resolve.ts` (+ `resolve.test.ts`), `mcp-server/src/types.ts`
- **Covers**: AC-54, AC-55, AC-56, AC-57
- **Required skills**: zod, typescript-expert
- **Depends on**: Step 1 (contract shape only; tests stub the API)
- **Can run in parallel with**: Step 2, Step 7
- **What to do**:
  - `list_agents` takes an optional `repo` input (uuid or `owner/name`). `resolveRepo` matches `id` **or** `full_name`.
  - With `repo` → `GET /agents?repo=<id>` → items `{id,name,description,provider,model,languages,active}`. Without it → `GET /agents` → the same minus `active`, and no `enabled` key.
  - Update `AgentSummary` (drop `enabled`, add `languages`).
  - `run_agent_on_pr`: add a test where a stubbed 409 `agent_incompatible` gives `isError: true` with the API message. Logic changes only if the test shows the message is lost.
- **Acceptance criteria**: `cd mcp-server && npm test` and `npm run typecheck` pass.

### Step 13 — E2E flows + docs
- **Domain**: e2e + docs
- **Module(s)**: `e2e/specs`, `docs/agent-prompts`, `server/README.md`
- **Files likely touched**: `e2e/specs/03-agents.flow.json`, a new `e2e/specs/08-agents-sections.flow.json`, `docs/agent-prompts/{general,security,performance,test-quality}-reviewer-python.md`, `docs/agent-prompts/README.md`, `server/README.md` (routes)
- **Covers**: AC-60 (visual e2e check), AC-47d (demo fixture works end to end)
- **Required skills**: none from the table for the e2e part (read `e2e/README.md` first); use the `doc-writer` skill for the docs
- **Depends on**: Steps 3, 5, 6, 8, 9, 10
- **Can run in parallel with**: none (final batch)
- **What to do**:
  - Keep `03-agents` green: Security Reviewer is visible under "Active on acme/payments-api".
  - Add a flow for `/agents`: both section headings, the "TypeScript · JavaScript" badge text visible on a card, and a screenshot for the AC-60 visual check.
  - Write the four Python prompt mirrors from `seed-prompts.ts`.
  - Document the new routes in `server/README.md`.
- **Acceptance criteria**: `cd e2e && npm run e2e:hermetic` passes; the docs mirror the seed text exactly.

## Coverage

| Spec ID | Step(s) | Planned test (package · file or name · unit/it/e2e) |
|---|---|---|
| AC-1 | 6 | server · `test/repos-stack.test.ts` · unit |
| AC-2 | 6 | server · `test/repos-stack.test.ts` · unit |
| AC-3 | 4, 5, 6 | server · `test/repo-stack-service.test.ts` + `test/reviews-compat.test.ts` · unit |
| AC-4 | 4 | server · `test/stack-compat.test.ts` · unit |
| AC-5 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| AC-6 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| AC-7 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| AC-8 | 4 | server · `test/stack-compat.test.ts` + `test/repo-stack-service.test.ts` · unit |
| AC-9 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| AC-10 | 1, 2, 5 | server · `test/agents-repo-scope.test.ts` · unit |
| AC-11 | 5 | server · `test/agents-repo-scope.test.ts` · unit |
| AC-12 | 5, 9 | server · `test/agents-repo-scope.test.ts` · unit; client · `ConfigTab/ConfigTab.test.tsx` · unit |
| AC-13 | 5 | server · `test/agents-repo-scope.test.ts` · unit |
| AC-14 | 1, 5 | server · `test/agents-repo-scope.test.ts` (schema + 422 mapping) · unit |
| AC-15 | 4 | server · `test/stack-compat.test.ts` · unit |
| AC-16 | 4 | server · `test/stack-compat.test.ts` · unit |
| AC-17 | 4, 5 | server · `test/agents-repo-scope.test.ts` · unit |
| AC-18 | 2, 4, 5 | server · `test/agents-repo-scope.test.ts` · unit |
| AC-18a | 4, 6 | server · `test/stack-compat.test.ts` + `test/reviews-compat.test.ts` · unit |
| AC-19 | 2 | server · `test/stack-aware-migration.it.test.ts` · it |
| AC-20 | 6 | server · `test/repos-stack.test.ts` + `test/reviews-compat.test.ts` · unit |
| AC-21 | 5 | server · `test/agents-repo-scope.test.ts` · unit |
| AC-22 | 5, 8 | server · `test/agents-repo-scope.test.ts` · unit; client · `AgentsListView.test.tsx` · unit |
| AC-22a | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-23 | 7, 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-23a | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-24 | 2 | server · `test/stack-aware-migration.it.test.ts` · it |
| AC-25 | 5, 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-25a | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-26 | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-26a | 7 | client · `app-shell/hooks/useShellContext.test.tsx` · unit |
| AC-27 | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-28 | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-29 | 4, 8 | server · `test/repo-stack-service.test.ts` · unit; client · `AgentsListView.test.tsx` · unit |
| AC-30 | 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-31 | 5, 9 | server · `test/agents-repo-scope.test.ts` · unit; client · `AgentEditor.test.tsx` · unit |
| AC-32 | 6 | server · `test/reviews-compat.test.ts` · unit |
| AC-33 | 10 | client · `RunReviewDropdown.test.tsx` · unit |
| AC-34 | 6, 10 | server · `test/reviews-compat.test.ts` · unit; client · `RunReviewDropdown.test.tsx` · unit |
| AC-35 | 6 | server · `test/reviews-compat.test.ts` · unit |
| AC-36 | 6, 10 | server · `test/reviews-compat.test.ts` · unit; client · `RunReviewDropdown.test.tsx` · unit |
| AC-37 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| AC-38 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| AC-39 | 4, 6 | server · `test/repo-stack-service.test.ts` + `test/reviews-compat.test.ts` · unit |
| AC-40 | 4 | server · `test/stack-compat.test.ts` · unit |
| AC-41 | 4 | server · `test/stack-compat.test.ts` · unit |
| AC-42 | 4 | server · `test/stack-compat.test.ts` · unit |
| AC-43 | 4, 6 | server · `test/repos-stack.test.ts` · unit |
| AC-44 | 4 | server · `test/repo-stack-service.test.ts` (fake clock) · unit |
| AC-45 | 7, 8 | client · `AgentsListView/AgentsListView.test.tsx` · unit |
| AC-46 | 3 | server · `test/seed-stack-aware.it.test.ts` · it |
| AC-47 | 3 | server · `test/seed-stack-aware.it.test.ts` · it |
| AC-47a | 2, 3 | server · `test/stack-aware-migration.it.test.ts` + `test/seed-stack-aware.it.test.ts` · it |
| AC-47b | 3 | server · `test/seed-stack-aware.it.test.ts` · it |
| AC-47c | 3 | server · `test/seed-stack-aware.it.test.ts` · it |
| AC-47d | 3, 13 | server · `test/seed-stack-aware.it.test.ts` · it; e2e · `03-agents.flow.json` · e2e |
| AC-48 | 3 | server · `test/seed-prompts-python.test.ts` · unit |
| AC-49 | 3 | server · `test/seed-prompts-python.test.ts` · unit |
| AC-50 | 3 | server · `test/seed-prompts-python.test.ts` · unit |
| AC-51 | 3 | server · `test/seed-prompts-python.test.ts` · unit |
| AC-52 | 3 | server · `test/seed-stack-aware.it.test.ts` · it |
| AC-53 | 2 | server · `test/stack-aware-migration.it.test.ts` · it |
| AC-54 | 12 | mcp-server · `src/tools/list-agents.test.ts` · unit |
| AC-55 | 12 | mcp-server · `src/tools/list-agents.test.ts` · unit |
| AC-56 | 12 | mcp-server · `src/tools/list-agents.test.ts` · unit |
| AC-57 | 12 | mcp-server · `src/tools/run-agent-on-pr.test.ts` · unit |
| AC-58 | 7, 8 | client · `LanguageBadge.test.tsx` + `AgentCard.test.tsx` · unit |
| AC-59 | 7, 8 | client · `LanguageBadge.test.tsx` + `AgentCard.test.tsx` · unit |
| AC-60 | 8, 13 | client · `AgentCard.test.tsx` · unit; e2e · `08-agents-sections.flow.json` · e2e |
| AC-61 | 9 | client · `AgentEditor.test.tsx` · unit |
| AC-62 | 9 | client · `AgentEditor.test.tsx` · unit |
| AC-63 | 7 | client · `LanguageBadge.test.tsx` · unit |
| NFR-1 | 4 | server · `test/repo-stack-service.test.ts` (fake timers) · unit |
| NFR-2 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| NFR-3 | 4 | server · `test/repo-stack-service.test.ts` · unit |
| NFR-4 | 4, 6 | server · `test/repo-stack-service.test.ts` + `test/repos-stack.test.ts` · unit |
| NFR-5 | 6 | server · `test/reviews-compat.test.ts` (MockLLMProvider count) · unit |
| NFR-6 | 1, 4 | server · `test/repo-stack-service.test.ts` (log/response/no token) · unit |
| NFR-7 | 4, 5 | server · `test/agents-repo-scope.test.ts` · unit |
| NFR-8 | 7, 8 | client · `LanguageBadge.test.tsx` + `AgentsListView.test.tsx` · unit |
| NFR-9 | 7, 8, 9, 10 | client · `AgentsListView.test.tsx`, `AgentEditor.test.tsx`, `RunReviewDropdown.test.tsx` · unit |
| NFR-10 | 4, 5, 6, 7–12 | all suites above hermetic; DB lane only for the migration + seed `.it` files |
| NFR-11 | 4 | server · `test/repo-stack-service.test.ts` (log assertion) · unit |
| NFR-12 | 6 | server · `test/run-executor.test.ts` · unit |

## Execution guidance
Multi-agent, in five sequential batches of at most 4 implementors each. No worktrees are needed: every pair of steps in a batch has disjoint files. The server steps share the package but not the files, so the session runs the package typecheck after each batch.

| Batch | Steps | Notes |
|---|---|---|
| 1 | Step 1 (alone) | Contract gate. Ends with both packages typechecking green and the vendored copies identical. |
| 2 | Step 2, Step 7, Step 12 | Server DB, client foundation, mcp-server. Separate packages. |
| 3 | Step 3, Step 4, Step 8, Step 9 | Seed (`db/seed*.ts`) and repo-stack (`platform/`, `modules/repo-stack/`, `container.ts`, `modules/index.ts`) don't share files; `/agents` page vs editor are separate client dirs. |
| 4 | Step 5, Step 6, Step 10 | Agents module vs repos/polling/reviews vs the PR dropdown. Step 5 owns `modules/agents/*`; Step 6 must not edit it. |
| 5 | Step 13 | After the stack is rebuilt (see DoD). |

File-ownership rules:
- Only Step 1 touches both `vendor/shared` copies.
- Only Step 7 touches `client/messages/en/agents.json`.
- Only Step 4 touches `container.ts` and `modules/index.ts`.
- Only Step 2 touches migrations and `rows.ts`.

**Live-DB safety:** Step 2 generates migrations but must **not** apply them to the live Docker DB. Nobody runs `docker compose down -v`.

## Definition of done
1. **Per batch:**
   - `scripts/verify.sh server <changed files>` and `scripts/verify.sh client <changed files>`;
   - for mcp-server, `cd mcp-server && npm run typecheck && npm test` (npm, not pnpm; `verify.sh` doesn't cover it).
2. **After all steps land:**
   - `scripts/verify.sh server --full` (needs Docker: the migration and seed `.it` lanes, which self-skip without Docker; confirm they actually ran) and `scripts/verify.sh client --full`;
   - `cd e2e && npm run e2e:hermetic`.
3. **Applying to the live DB:**
   1. Back it up first: `docker compose exec postgres pg_dump -U devdigest devdigest > ~/devdigest-pre-stack-aware.sql`.
   2. Then `docker compose up -d --build api web`. The entrypoint migrates and seeds.
   3. Check:
      - `GET /agents`: the four "(Python)" agents show `["Python"]` with no duplicates;
      - the Node built-ins show `["TypeScript","JavaScript"]`;
      - the Node agents are inactive on existing repos (from `enabled=false`).
4. **Gates, in the order `/implement-plan` sets:** `plan-verifier` against the spec and this plan → `pr-self-review` before the PR → `engineering-insights` (likely entries: the opt-in state model, the migrate-up-to test helper, platform placement of `stack-compat`).
5. **Branch:** `feat/LAB5-stack-aware-agents`.
