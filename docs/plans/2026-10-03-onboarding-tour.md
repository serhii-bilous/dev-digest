# Implementation plan: Onboarding Tour (Onboarding Generator)

**Execution mode:** multi-agent (chosen by the user)
**Requirements source:** `specs/2026-10-03-onboarding-tour.md`. This plan only reads it and changes nothing under `*/specs/**`.
**Spec ID:** SPEC-2026-10-03-onboarding-tour
**Branch:** stay on `feat/LAB5-onboarding-generator`. No new branch.
**Save as:** `docs/plans/2026-10-03-onboarding-tour.md` (same date and slug as the spec). The session writes the file; this agent is read-only.

## Overview
This builds a per-repo, read-only **Onboarding Tour** page at `/repos/:repoId/onboarding`, reached from the sidebar WORKSPACE group. It has five collapsible sections:
1. Architecture overview (prose plus a diagram drawn by code)
2. Critical paths
3. How to run locally
4. Guided reading path
5. First tasks

How the content is produced:
- A new repo-intel facade method gathers every fact deterministically.
- The reading path is ordered by **PageRank × (1 + hotness)**. Hotness is the count of distinct imported PRs over 180 days that touched the file, normalised 0..1.
- **Exactly one** structured LLM call turns the facts into prose.
- If the AI step fails or the index is degraded, the page shows a deterministic skeleton with an honest status.
- Nothing generates on its own. The model and the estimated cost show before every Generate or Regenerate.

The client follows the design screenshot: "ON THIS PAGE" anchor nav, a header with Regenerate and Share link, and five cards.

## Assumptions
User decisions (Phase 1, all option A):
- **Q1** Edit `client/src/vendor/ui/nav.ts` minimally, with no gKey. Remove the duplicated `g x` row in `SHORTCUTS`.
- **Q2** The route is `/repos/:repoId/onboarding`. `activeKeyFor` is anchored to `^/repos/[^/]+/onboarding`, so `/onboarding` maps to `""`.
- **Q3** Extend the existing `onboarding` table with one migration: `json` becomes nullable, and `generation_state` (`idle|generating|failed`, NOT NULL, default `idle`), `generation_started_at` (timestamptz, null) and `generation_error` (text, null) are added. `generated_at` stays as it is; the read model uses the tour JSON's `generated_at`.
- **Q4** Index mapping:
  - **Not ready** (AC-56) when there is no `clonePath`, or the status is `failed`, or there is no persisted index row (`no_data`).
  - `degraded` when the status is `degraded` or `REPO_INTEL_ENABLED=false`. Facade reads then return empty, and manifest facts are still read from the clone.
  - `partial` stays `partial`.
  - `files_total` is `filesIndexed + filesSkipped`.
- **Q5** The hotness window uses `COALESCE(pull_requests.updated_at, opened_at)`. PRs where both are null are excluded. "Now" comes from an injectable clock. The window is `HOTNESS_WINDOW_DAYS = 180` (already in `server/src/modules/repo-intel/constants.ts:50`).
- **Q6** A source file `x/foo.ts` counts as tested if any indexed file has basename `foo.test.*` or `foo.spec.*`, in any directory.
- **Q7** Diagram rules:
  - A top-level folder is the first path segment. If every ranked file shares one root, descend one level.
  - Entry points come from the root manifest's `main`/`bin`. If there are none, use well-known names (`src/index|main|server|app.*`, `index.*`). At most 2.
  - Service nodes are unconnected in v1.
- **Q8** The cost estimate is shown inline next to Generate/Regenerate. The actual model and cost and the stale badge go on the meta line under the subtitle.
- **Q9** Links inside AI prose render as plain text. Only indexed-path code refs are linked.
- **Q10** NFR-1 and NFR-2 are asserted with single-run wall-clock thresholds. There is no p95 harness.
- **Q11** Add an e2e flow.

Planner-side defaults (the spec is silent; flagged for the Codex review):
- **AI `skipped` status.** It is used only when the facts are empty: no ranked files and no root manifest. In that case no call is made, and the skeleton is stored with reason "Nothing to describe".
- **Regeneration with no AI.** AI-not-configured (AC-48) during a regeneration over a stored `ai` tour is handled like AC-22: the stored tour is kept, `generation.state = failed`, and the error reads "AI not configured".
- **Deterministic-phase or store failure** (DB error, facts read error). `generation.state = failed` with the error message, and the previous tour is kept (NFR-10).
- **State after AC-23.** After a skeleton is stored, `generation.state` returns to `idle`. The AI reason lives on `tour.ai.reason` and is shown by the AC-54 banner.
- **Section anchors:** `architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`. An unknown fragment is ignored.
- **AC-50 mechanism, with no contract change.** The server rewrites `architecture.summary_md`: any inline-code span that looks like a path (contains `/` or a file extension) and is **not** in the indexed path set loses its backticks and becomes plain text. The client then links every remaining path-like inline-code span to GitHub at the tour commit.
- **Fixed failure reasons:**
  - `AI output invalid` (AC-46)
  - `AI timed out after 60 s` (AC-47)
  - `Provider error: <message>` (AC-47)
  - `AI not configured` (AC-48)
- **Response schemas.** The three new routes declare `schema.response` with the shared Zod contracts. This is the first use of response schemas here (server INSIGHTS 2026-08-05).

## Accepted recommendations
1. Contract-first step, with the client vendored copy mirrored byte-identical and `contracts.test.ts` updated → **Step 1**.
2. No `JobRunner`. Generation runs in-process as fire-and-forget with a catch-all, DB-backed state, and a boot reaper in `app.ts` → **Step 5**.
3. An atomic upsert claims the generation slot (AC-17) → **Step 5** repository, plus the **Step 2** schema.
4. An outer 60 s `withTimeout` with `maxRetries: 1` → **Step 5**.
5. A pure deterministic core in `modules/onboarding/` with hermetic tests → **Step 4**.
6. One aggregated facade method, `repoIntel.getOnboardingFacts`. The hotness query lives in the onboarding module's own repository → **Step 3** (facts) and **Step 5** (hotness).
7. A local `TourMarkdown` with react-markdown, `skipHtml`, path-only links, and links shown as text → **Step 8**.
8. A plain DOM/SVG layered diagram with a screen-reader text alternative → **Step 8**.
9. An anchored `activeKeyFor`, plus removing the duplicate `g x` → **Step 6**.
10. Docs and INSIGHTS through `doc-writer` and `engineering-insights` → **Step 10**.

## Module impact map
- **`server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`.** The `Onboarding*` shapes are replaced with the spec's Contracts section. Checked: root INSIGHTS 2026-07-29 (the client copy lags), root INSIGHTS 2026-08-13 (pre-staged contracts drift).
- **`server/src/db/schema/context.ts` and `server/src/db/migrations/`.** The `onboarding` table is extended. Checked: server INSIGHTS 2026-08-05 (generate, then migrate; the interactive rename prompt only appears on a column drop, and none is dropped here).
- **`server/src/modules/repo-intel/`.** New facade method `getOnboardingFacts` and new repository reads. `pipeline/rank.ts` and `file_rank` writes are untouched (AC-33). Checked: `README.md`, `types.ts` degraded contract, `rank.ts` Option B (hotness pinned to 0).
- **`server/src/modules/onboarding/` (new).** The pure core, repository, service and routes. `server/src/prompts/onboarding.system.md` is rewritten. Checked: the conventions module, the closest analogue (LLM call plus a code-verification gate), and server INSIGHTS 2026-08-05 (field order in the structured schema).
- **`server/src/modules/index.ts` and `server/src/app.ts`.** Module registration and the boot reaper.
- **`server/test/`.** New hermetic and `*.it.test.ts` tests, plus `contracts.test.ts`.
- **`client/src/vendor/ui/nav.ts` and `client/src/components/app-shell/`.** The nav item and the active key.
- **`client/src/lib/hooks/onboarding.ts` (new) and `client/messages/en/onboarding.json` (rewritten).** The `/onboarding` add-repo view uses hardcoded copy, not this namespace (`client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx`), so it is unaffected.
- **`client/src/app/repos/[repoId]/onboarding/` (new).** The page and its `_components`, modelled on `client/src/app/repos/[repoId]/context/page.tsx`. Checked: `client/CLAUDE.md` (thin pages, hooks-only data access, next-intl), client INSIGHTS (avoid loose-regex RTL queries; `act()` with fake timers).
- **`e2e/specs/` and `e2e/README.md`.** One new flow. The existing `06-onboarding.flow.json` (add-repo) is unchanged.
- **Docs:** `server/README.md`, `server/src/modules/repo-intel/README.md`, `client/README.md`, root `INSIGHTS.md`, `server/INSIGHTS.md`.

## Architecture notes (backend)
- **Domain: pure, no IO** (`server/src/modules/onboarding/`). Covered by unit tests:
  - `constants.ts`, `types.ts` (LLM output schema)
  - `diagram.ts`, `critical-paths.ts`, `hotness.ts`, `reading-path.ts`, `run-commands.ts`, `first-tasks.ts`
  - `skeleton.ts`, `llm-input.ts`, `merge.ts`

  These take plain data (`OnboardingFacts`, touch counts, a token-count function, a clock value) and return contract-shaped data.
- **Application** (`service.ts`). `OnboardingService(container, opts?: { repo?, clock?, logger? })` orchestrates:
  - workspace check through `container.reposRepo.getById(workspaceId, repoId)`;
  - facts through `container.repoIntel.getOnboardingFacts`;
  - hotness counts through its own repository;
  - the model through `resolveFeatureModel(container, ws, 'onboarding')` (`modules/settings/feature-models.ts`, which depcruise allows);
  - the LLM through `container.llm(provider)`, with a `ConfigError` meaning AI not configured;
  - the price through `container.priceBook.estimate`;
  - the logger through the routes' `app.log`.

  Generation runs as `void this.runGeneration(...).catch(...)`, never through `container.jobs` (JobRunner retries would issue a second LLM call).
- **Infrastructure:**
  - `onboarding/repository.ts` (Drizzle): row read, atomic claim, complete, fail, reap, and the PR-touch aggregate over `pr_files ⋈ pull_requests`.
  - `repo-intel/repository.ts`: new reads for ranked rows with `pagerank`, exported-symbol counts, all `file_facts` rows, and all indexed paths.
  - `repo-intel/pipeline/manifest-facts.ts`: reads the root `package.json`, the lockfile, the env example, the compose file and its services, and subfolder manifests up to depth 3, using the walk's `EXCLUDED_DIRS` and never following symlinks. It sits beside `walk.ts`, which is the existing precedent for fs reads inside repo-intel.
- **Presentation** (`onboarding/routes.ts`). Zod `params` and `response` from `@devdigest/shared`; `getContext(app.container, req)` supplies `workspaceId`.
  - `GET  /repos/:id/onboarding` → `OnboardingRead`
  - `GET  /repos/:id/onboarding/estimate` → `OnboardingEstimate`
  - `POST /repos/:id/onboarding/generate` → `OnboardingGeneration` (no body). Typed `AppError('index_not_ready', 409)` for AC-56. 404 for a foreign repo.
- **Composition root:**
  - `modules/index.ts` registers the plugin.
  - `app.ts` calls `OnboardingService.reapInterruptedGenerations()` next to the existing `reapStaleRuns` (`server/src/app.ts:81`).
  - `container.ts` is not changed, since the repository is built inside the service like `ConventionsService` does. Hermetic tests inject `opts.repo`.
- **Depcruise:** `onboarding/**` must not import `repo-intel/{service,repository}` or `repos/repository`. Use `container.repoIntel` (typed by `repo-intel/types.ts`), `container.reposRepo` and `repo-intel/constants.ts`.

## Steps

### Step 1: Shared contract for the Onboarding Tour (server first, then the client mirror)
- **Domain**: backend (contract)
- **Module(s)**: `server/src/vendor/shared/`, `client/src/vendor/shared/`, `server/test/`
- **Layer**: domain (contract)
- **Files likely touched**: `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts` (only the Onboarding block, mirrored byte-identically), `server/src/vendor/shared/index.ts` and its client twin (only if the export list or comment changes), `server/test/contracts.test.ts`
- **Covers**: infra. Contract basis for AC-5, AC-9, AC-13, AC-16, AC-18, AC-19, AC-20, AC-25, AC-26, AC-28, AC-29, AC-34, AC-38, AC-39, AC-53, AC-54, AC-55, AC-56; NFR-5.
- **Required skills**: zod, typescript-expert
- **Depends on**: none
- **Can run in parallel with**: Steps 2, 3, 6. No file overlap.
- **What to do**:
  1. Delete `OnboardingLink` and `OnboardingSection`, and replace `Onboarding` with the spec's tour shape. Export these schemas and types:
     - `OnboardingProvenance` (`ai|index`)
     - `OnboardingIndexInfo` {`status` `full|partial|degraded`, `files_indexed` int, `files_total` int|null, `degraded_reason` string|null}
     - `OnboardingAiInfo` {`status` `ok|failed|invalid_output|timeout|not_configured|skipped`, `reason`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, each nullable}
     - `OnboardingDiagram` {`nodes` ≤ 12 of {`id`, `label`, `kind` `entry|folder|service`}, `edges` {`from`, `to`}[], `omitted_folders` int ≥ 0}
     - the five section schemas, exactly as in the spec's Contracts section, with the max lengths enforced (critical ≤ 8, reading ≤ 10, first tasks ≤ 5, `manifests_found` ≤ 5, `hotness` 0..1)
     - `Onboarding` {`repo_id`, `commit_sha`, `generated_at` (ISO string), `mode`, `index`, `ai`, `sections`}
     - `OnboardingGeneration` {`state` `idle|generating|failed`, `started_at` nullable, `error` nullable}
     - `OnboardingRead` {`tour` `Onboarding|null`, `generation`, `current_index_commit` nullable, `stale` bool, `index_ready` bool}
     - `OnboardingEstimate` {`provider`, `model`, `est_input_tokens` int, `est_cost_usd` number|null}
  2. Copy the identical block into the client copy. Do not touch unrelated drift in that file.
  3. In `contracts.test.ts`, replace the old `Onboarding.parse` case. Add a valid tour fixture that parses; check that a legacy `{sections:[{kind,…}]}` fails `Onboarding.safeParse` (the basis for AC-13); and check that 13 nodes or 9 critical items are rejected.
- **Acceptance criteria**: both copies are identical (`diff` of the Onboarding block is empty); `cd server && pnpm typecheck` and `cd client && pnpm typecheck` are green; `scripts/verify.sh server server/test/contracts.test.ts` passes.

### Step 2: Extend the `onboarding` table (migration)
- **Domain**: backend
- **Module(s)**: `server/src/db/`
- **Layer**: infrastructure
- **Files likely touched**: `server/src/db/schema/context.ts` (the `onboarding` table only), the new migration `server/src/db/migrations/00NN_*.sql` and `meta/*` (generated, never hand-edited)
- **Covers**: infra for AC-17, AC-22, AC-23, AC-24; NFR-10
- **Required skills**: drizzle-orm-patterns, postgresql-table-design
- **Depends on**: none
- **Can run in parallel with**: Steps 1, 3, 6
- **What to do**:
  - Make `json` nullable.
  - Add `generationState: text('generation_state', { enum: ['idle','generating','failed'] }).notNull().default('idle')`, `generationStartedAt` (timestamptz, null) and `generationError` (text, null).
  - Add a CHECK constraint on `generation_state` if `postgresql-table-design` and the existing schema files use `check(`. If not, leave a comment.
  - Run `cd server && pnpm db:generate`, then `pnpm db:migrate` against the dev DB.
  - Verify that the generated SQL only alters and adds columns, and that the migration journal appends rather than rewrites history (server INSIGHTS 2026-08-05).
- **Acceptance criteria**: the migration applies cleanly on a fresh testcontainer (exercised by Step 5's `.it` test) and on the dev DB; `pnpm typecheck` is green.

### Step 3: repo-intel facade, `getOnboardingFacts` (stack, structure, routes, scripts, rank, chains, edges)
- **Domain**: backend
- **Module(s)**: `server/src/modules/repo-intel/`
- **Layer**: infrastructure (repository and fs reader) + application (facade)
- **Files likely touched**:
  - edit: `server/src/modules/repo-intel/types.ts`, `service.ts`, `repository.ts`, `constants.ts`
  - new: `server/src/modules/repo-intel/pipeline/manifest-facts.ts`
  - tests (new): `server/test/repo-intel-onboarding-facts.test.ts` (hermetic: tmp-dir clone plus a stubbed repository) and `server/test/repo-intel-onboarding-facts.it.test.ts` (real Postgres reads)
  - fix any existing test that implements `RepoIntel` structurally, if typecheck requires it
- **Covers**: AC-34 (fact detection), AC-38 (manifests found), AC-57 (empty graph result), AC-63; supports AC-25, AC-28, AC-29, AC-33, AC-42, AC-56; NFR-2 (gathering cost)
- **Required skills**: onion-architecture, drizzle-orm-patterns, typescript-expert, security
- **Depends on**: none
- **Can run in parallel with**: Steps 1, 2, 6
- **What to do**:
  1. In `types.ts`, add `getOnboardingFacts(repoId: string): Promise<OnboardingFacts>` to `RepoIntel`, and export:
     ```ts
     interface OnboardingFacts {
       index: { status: IndexStatus | 'none'; ready: boolean;
                notReadyReason: 'no_clone' | 'index_failed' | 'no_data' | null;
                flagOff: boolean; filesIndexed: number; filesSkipped: number;
                commitSha: string; degradedReason: string | null };
       ranked: { path: string; pagerank: number; inDegree: number; exportedCount: number }[]; // top 40 non-junk, pagerank desc, path asc
       routeFiles: { path: string; pagerank: number; endpoints: string[] }[];                // total endpoints ≤ 30
       criticalChains: string[][];
       edges: { from: string; to: string }[];
       indexedPaths: string[];                                   // sorted, full indexed set (≤ MAX_INDEXED_FILES)
       structure: string[];                                      // dirs ≤ 3 levels, sorted
       manifest: { rootPath: string | null; scripts: Record<string, string>; // ≤ 20 entries
                   dependencies: string[]; main: string | null; bin: string[];
                   lockfile: 'pnpm' | 'npm' | 'yarn' | null; envExample: string | null;
                   composeFile: string | null; composeServices: string[]; subManifests: string[] }; // ≤ 5
       stack: string[];
       services: string[];                                       // detected external services, sorted
     }
     ```
  2. In `constants.ts`, add:
     - `ONBOARDING_CAPS = { files: 40, routes: 30, scripts: 20, structureDepth: 3, subManifests: 5 }`
     - `ENV_EXAMPLE_FILES` = `.env.example`, `.env.sample`, `.env.template`
     - `COMPOSE_FILES` = `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`
     - `SERVICE_DEPENDENCIES`, a fixed map. At least `pg`/`postgres`/`drizzle-orm`→postgres, `redis`/`ioredis`→redis, `mongodb`/`mongoose`→mongodb, `mysql`/`mysql2`→mysql, `kafkajs`→kafka, `amqplib`→rabbitmq, `stripe`→stripe.
     - `STACK_MARKERS`, a dependency → label map (e.g. typescript, react, next, fastify, express, nestjs, drizzle-orm, prisma, vitest, jest).
     - `GENERATED_PATH_PATTERNS` (`.generated.`, `__generated__/`, `.gen.`, `/generated/`).
  3. In `repository.ts`, add:
     - `getRankedRows(repoId, limit)`: `filePath`, `pagerank`, ordered by pagerank desc then path asc;
     - `getAllIndexedPaths(repoId)`, from `file_rank`;
     - `getExportedSymbolCounts(repoId, paths)`: count of `symbols.exported = true`, excluding names containing `.`;
     - `getAllFileFacts(repoId)`.
  4. Add `manifest-facts.ts`, `readManifestFacts(clonePath)`:
     - Parse the root `package.json` with `JSON.parse` inside try/catch. A missing or bad file means the fact is absent, not an error.
     - Detect the lockfile in this order: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`.
     - Take the first existing env example and compose file.
     - Read compose service names with a minimal line parser: top-level `services:` keys only. Add no YAML dependency unless one is already in `server/package.json`.
     - Find subfolder `package.json` files to depth 3, excluding `EXCLUDED_DIRS`, never following symlinks, sorted, capped at 5.
     - All reads stay inside `clonePath`.
  5. In `service.ts`, implement `getOnboardingFacts`:
     - Index state comes from `tryGetIndexState` plus `getRepoBasics`, using the Q4 readiness rules.
     - When `!repoIntelEnabled`, set `flagOff: true` and leave the graph arrays empty, but still read manifest facts if the clone exists.
     - Apply `isJunkPath` plus `GENERATED_PATH_PATTERNS` to `ranked`. `inDegree` comes from the edges.
     - `criticalChains` comes from the existing `getCriticalPaths`.
     - Cap `routeFiles` at 30 endpoints total, taking the highest-ranked first.
     - Derive `structure` from `indexedPaths` (directories up to 3 levels).
     - Derive `stack` and `services` from the dependencies, the lockfile, file extensions and compose services, sorted and de-duplicated.
     - Never throw; degrade to empty values.
     - Do not touch `pipeline/rank.ts` or any `file_rank` write.
- **Tests (planned from ACs)**:
  - Hermetic: pnpm, npm, yarn and no-lockfile fixtures; env example present or absent; compose present or absent with services (AC-34 facts). No root manifest plus 7 nested manifests gives `rootPath: null` and exactly 5 sorted `subManifests` (AC-38). An oversized fixture of 60 ranked rows, 50 endpoints, 35 scripts and depth-5 dirs gives 40 / 30 / 20 / max depth 3 (AC-63). Zero edges gives `edges: []` and `criticalChains: []` while the manifest is still present (AC-57). Junk and generated paths are excluded from `ranked`. Flag off gives `flagOff: true` with an empty graph.
  - `.it`: seed `file_rank`, `file_edges`, `symbols` and `file_facts` rows, then check `pagerank` order, exported counts, and that `file_rank` rows are byte-identical before and after the call (supports AC-33).
- **Acceptance criteria**: `scripts/verify.sh server src/modules/repo-intel/service.ts src/modules/repo-intel/pipeline/manifest-facts.ts` is green; existing repo-intel tests still pass.

### Step 4: Onboarding pure core (builders, hotness, skeleton, LLM input and merge, prompt)
- **Domain**: backend
- **Module(s)**: `server/src/modules/onboarding/` (new), `server/src/prompts/`
- **Layer**: domain
- **Files likely touched**:
  - new in `server/src/modules/onboarding/`: `constants.ts`, `types.ts`, `diagram.ts`, `critical-paths.ts`, `hotness.ts`, `reading-path.ts`, `run-commands.ts`, `first-tasks.ts`, `skeleton.ts`, `llm-input.ts`, `merge.ts`
  - rewrite: `server/src/prompts/onboarding.system.md`
  - tests (new): `server/test/onboarding-diagram.test.ts`, `onboarding-critical-paths.test.ts`, `onboarding-reading-path.test.ts`, `onboarding-run-commands.test.ts`, `onboarding-first-tasks.test.ts`, `onboarding-skeleton.test.ts`, `onboarding-llm-input.test.ts`, `onboarding-merge.test.ts`
- **Covers**: AC-25, AC-26, AC-28, AC-29, AC-30, AC-31, AC-32, AC-34, AC-35, AC-38, AC-39, AC-40, AC-41, AC-42, AC-44, AC-49, AC-50 (server side), AC-52, AC-53 (provenance), AC-57; NFR-7, NFR-11 (pure determinism)
- **Required skills**: onion-architecture, zod, typescript-expert, security
- **Depends on**: Step 1 (contract types), Step 3 (`OnboardingFacts` type)
- **Can run in parallel with**: Step 7
- **What to do**:
  - **`constants.ts`:**
    - caps: diagram 12, critical 8, reading 10, AI tasks min 3 / max 5, fallback tasks 3, low-complexity export threshold 5, `LLM_INPUT_TOKEN_CAP = 12_000`, `LLM_TIMEOUT_MS = 60_000`, `LLM_MAX_RETRIES = 1`, `EST_OUTPUT_TOKENS = 2_000`
    - `ONBOARDING_SCHEMA_NAME`, the reason strings (Assumptions), and `NO_PR_ACTIVITY_NOTE`, `NO_GRAPH_NOTE`
    - re-export `HOTNESS_WINDOW_DAYS` from `../repo-intel/constants.js`
  - **`types.ts`:** the Zod `OnboardingLlmOutput`:
    - `architecture_summary_md`
    - `critical_paths` [{`path`, `reason`}]
    - `reading_path` [{`path`, `why`}]
    - `run_steps` [{`order`, `note`}]
    - `first_tasks` [{`title`, `path_hint`, `rationale`, `complexity`}], with `complexity` declared **last** (server INSIGHTS 2026-08-05)
  - **`diagram.ts`, `buildDiagram(facts)`** (AC-25, AC-26, AC-57):
    - Entry nodes per Q7.
    - Folder nodes: aggregate pagerank by top-level folder (Q7 descent rule), sorted by sum desc then name asc.
    - Service nodes per `facts.services`.
    - Fill node slots as entries, then services, then folders, up to 12. `omitted_folders` = the folders that qualified but were left out.
    - Edges: folder→folder when any file edge crosses folders (deduped, sorted), and entry→its folder.
    - No service edges (Q7).
    - Zero edges gives an empty `edges`.
    - Labels are raw strings; escaping is the client's job.
  - **`critical-paths.ts`** (AC-28): take the union of the chain files and `routeFiles`, dedupe, sort by pagerank desc then path asc, take 8. Index reasons: "declares N routes" for route files, otherwise "imported by N files".
  - **`hotness.ts`** (AC-30, AC-31): `computeHotness(counts: Map<path, n>)` returns `n / max`. When max is 0 or the map is empty, everything is 0 and `available = false`.
  - **`reading-path.ts`** (AC-29): `score = pagerank × (1 + hotness)`, sorted desc then path asc, take 10.
    - Exclude tests, configs, `.d.ts`, migrations and generated files. The facts are already filtered; apply the same rule defensively.
    - `why` (index) = "imported by N files · touched by M PRs".
    - `graph_available = edges.length > 0`. When it is false, return items: [] (AC-57).
  - **`run-commands.ts`** (AC-34, AC-38). Steps in order:
    1. `pnpm install` / `npm install` / `yarn install`. With no lockfile, use npm.
    2. `cp <envExample> .env`
    3. `docker compose up -d`
    4. `<pm> run dev`, or `start` when there is no `dev`. Use the `pnpm dev` / `npm run dev` / `yarn dev` forms.

    With no root manifest: `no_root_manifest: true`, `manifests_found` = subManifests (≤ 5), and steps hold at most the docker step if a compose file exists. Commands are built only from these templates; script bodies are never included.
  - **`first-tasks.ts`** (AC-42): take the top-ranked source files with no matching test (Q6 rule), up to 3. Title "Add tests for <path>", `path_hint` = path, complexity `low` if `exportedCount ≤ 5`, else `medium`, `rationale: null`.
  - **`skeleton.ts`, `buildSkeleton(facts, hotness, clockIso)`** (AC-52, AC-53): returns all five sections with `provenance: 'index'`.
    - `architecture.summary_md` is a deterministic sentence built from the stack and the entry points.
    - Applies every cap.
  - **`llm-input.ts`, `buildLlmMessages(facts, skeleton, countTokens)`** (AC-44, NFR-7):
    - The system prompt is `renderPrompt('onboarding.system.md', …)`.
    - Every repo-derived fact (paths, folder names, scripts, dependencies, routes, compose services, stack) is placed only inside `wrapUntrusted(...)` blocks (from `@devdigest/reviewer-core`, as conventions does), which escape the closing delimiter.
    - Facts are ordered by priority. While the total exceeds 12,000 tokens, drop the lowest-ranked fact items first.
    - The prompt tells the model to key its text only to the supplied paths and step orders, and that it must not add commands.
    - Returns `{ messages, inputTokens }`.
  - **`onboarding.system.md`:** rewrite it for the five typed sections. Remove `routes_and_apis` and mermaid.
  - **`merge.ts`, `mergeAiOutput(skeleton, output, indexedPaths)`:**
    - architecture: summary from the AI, with path-like code spans not in `indexedPaths` turned into plain text (AC-50, server side). Provenance `ai`. Diagram and stack stay from code (AC-25).
    - critical paths and reading path: membership and order stay from code. AI `reason`/`why` is accepted only when keyed to a path code supplied; anything else is discarded (AC-32, AC-49). Provenance is `ai` if at least one text was accepted.
    - run steps: commands never change. An AI `note` is accepted only for an existing `order` (AC-35, AC-36 data, AC-49).
    - first tasks: keep a task only if its `path_hint` is in `indexedPaths` or its parent directory is a prefix of an indexed path (AC-40). Cap at 5. If fewer than 1 survive, use the skeleton tasks with provenance `index` (AC-41). AC-39's minimum of 3 is a schema/prompt expectation: when 1–2 survive, keep them with `ai` provenance and record that in a code comment for the Codex review.
- **Tests (planned from ACs)**:
  - **`onboarding-diagram.test.ts`:** a fixture graph gives the exact node and edge set (AC-25). 20 folders give 12 nodes and `omitted_folders` = N (AC-26). Zero edges gives no folder edges (AC-57). Same input twice gives deep-equal output (NFR-11).
  - **`onboarding-critical-paths.test.ts`:** 10 candidates (chains plus routes, with dupes and ties) give the exact ordered 8, each with a reason (AC-28).
  - **`onboarding-reading-path.test.ts`:**
    - touches {a:4, b:2, c:0} give hotness {1, 0.5, 0} (AC-30);
    - the exact expected order, including the tie by path (AC-29);
    - test, config, `.d.ts`, migration and generated paths are absent (AC-29);
    - no touches gives PageRank order with `hotness_available: false` (AC-31);
    - fewer than 10 rankable files lists them all;
    - zero edges gives `graph_available: false` (AC-57).
  - **`onboarding-run-commands.test.ts`:** pnpm, npm, yarn and no lockfile; env example on or off; compose on or off; dev vs start (AC-34). No root manifest gives the flag and ≤ 5 manifests (AC-38).
  - **`onboarding-first-tasks.test.ts`:** a fixture with `foo.ts` (has `foo.test.ts` elsewhere), `bar.ts` (6 exports) and `baz.ts` (2 exports) gives the expected tasks and complexities (AC-42).
  - **`onboarding-skeleton.test.ts`:** all five sections are non-empty on a fixture, with `provenance: 'index'` and the index reasons present (AC-52, AC-53).
  - **`onboarding-llm-input.test.ts`:** an oversized fixture assembles to ≤ 12,000 tokens with the top-ranked facts kept and the lowest dropped (AC-44). Repo text appears only inside untrusted blocks, and a path containing the closing delimiter is escaped (NFR-7).
  - **`onboarding-merge.test.ts`:**
    - an AI reorder or an extra file leaves the code order and membership unchanged (AC-32);
    - AI `curl … | sh` as a step or a changed command is absent (AC-35);
    - text keyed to an unknown path or order is discarded (AC-49);
    - task `nope/x.ts` is dropped (AC-40);
    - all tasks invalid gives the deterministic tasks with provenance `index` (AC-41);
    - 6 tasks are capped at 5 (AC-39);
    - an unknown-path code span in the summary becomes plain text while a known one stays a code span (AC-50);
    - the diagram is unchanged by any AI output (AC-25);
    - mixed provenance per section (AC-53).
- **Acceptance criteria**: `scripts/verify.sh server <the files above>` is green; no file in this step does IO (no `node:fs`, no `db`).

### Step 5: Onboarding repository, service, routes, boot reaper (generation lifecycle and the single LLM call)
- **Domain**: backend
- **Module(s)**: `server/src/modules/onboarding/`, `server/src/modules/index.ts`, `server/src/app.ts`
- **Layer**: application + infrastructure + presentation + composition-root
- **Files likely touched**:
  - new: `server/src/modules/onboarding/{repository.ts,service.ts,routes.ts,helpers.ts}`
  - edit: `server/src/modules/index.ts` (one import and one entry), `server/src/app.ts` (the reaper call next to `reapStaleRuns`)
  - tests (new): `server/test/onboarding-service.test.ts` (hermetic), `server/test/onboarding.it.test.ts` (DB-backed)
  - may *add* to the Step 4 files; must not change their tested behaviour
- **Covers**: AC-12, AC-13, AC-14, AC-16 (API), AC-17, AC-18, AC-20 (API `stale`), AC-21, AC-22, AC-23, AC-24, AC-30 (window query), AC-32, AC-33, AC-35, AC-40, AC-41, AC-43, AC-45, AC-46, AC-47, AC-48, AC-49, AC-52, AC-54 (index and AI status mapping), AC-55 (`files_total`), AC-56, AC-57, AC-61; NFR-1, NFR-2, NFR-4, NFR-5, NFR-6, NFR-10, NFR-11, NFR-12
- **Required skills**: onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod, security, typescript-expert
- **Depends on**: Steps 1, 2, 3, 4
- **Can run in parallel with**: Step 8
- **What to do**:
  - **`repository.ts`:**
    - `getRow(repoId)`.
    - `claimGeneration(repoId, now)`: `INSERT INTO onboarding (repo_id, json, generation_state, generation_started_at, generation_error) VALUES ($1, NULL, 'generating', $now, NULL) ON CONFLICT (repo_id) DO UPDATE SET generation_state='generating', generation_started_at=$now, generation_error=NULL WHERE onboarding.generation_state <> 'generating' RETURNING …`. A returned row means claimed; no row means already in progress.
    - `completeGeneration(repoId, tourJson)`: an UPDATE setting `json`, `generated_at`, `state='idle'`, `error=NULL`. Zero rows (repo deleted) means discard silently.
    - `failGeneration(repoId, error)`: state `failed` with the error. The stored `json` is left untouched.
    - `reapGenerating()`: `UPDATE … SET generation_state='failed', generation_error='Interrupted by server restart' WHERE generation_state='generating'`.
    - `touchCounts(repoId, since)`: `SELECT f.path, COUNT(DISTINCT f.pr_id) … FROM pr_files f JOIN pull_requests p ON p.id = f.pr_id WHERE p.repo_id = $1 AND COALESCE(p.updated_at, p.opened_at) >= $since GROUP BY f.path`.
  - **`service.ts`:**
    - **`read(ws, repoId)`:**
      - repo via `container.reposRepo.getById(ws, repoId)`; missing → `NotFoundError` (AC-12, NFR-6).
      - `Onboarding.safeParse(row.json)`; failure or null → `tour: null` (AC-13).
      - `current_index_commit` from `repoIntel.getIndexState(repoId).lastIndexedSha`, or null.
      - `stale = !!tour && current !== tour.commit_sha`.
      - `index_ready` per the Q4 rules, using `getRepoBasics` via the facts' `index` (or a cheap state plus clonePath check; there must be **no** fact gathering on this hot path, for NFR-1).
      - `generation` from the row.
      - No LLM call (NFR-4).
    - **`estimate(ws, repoId)`:** repo check; `resolveFeatureModel(container, ws, 'onboarding')`; facts, then `buildSkeleton`, then `buildLlmMessages` to get `inputTokens`; then `priceBook.estimate(model, inputTokens, EST_OUTPUT_TOKENS)`. Returns `{provider, model, est_input_tokens, est_cost_usd}`. No `container.llm` call (AC-16, NFR-4).
    - **`generate(ws, repoId)`:**
      - repo check;
      - readiness check; not ready → throw `AppError` code `index_not_ready` (409) with **no** claim and no call (AC-56);
      - `claimGeneration`; not claimed → return the current `generation` (AC-17);
      - otherwise `void this.runGeneration(...)` and return `{state:'generating', started_at}` immediately (AC-14).
    - **`runGeneration`**, phases timed with `performance.now()`:
      1. facts (the commit is captured from `facts.index.commitSha` at the start);
      2. `touchCounts(repoId, clock() − 180 d)`, where a failure gives hotness 0 and a logged note (NFR-10);
      3. skeleton;
      4. the AI step:
         - empty facts → `skipped`, 0 calls;
         - `await container.llm(provider)`, where a `ConfigError` gives `not_configured`, 0 calls (AC-48);
         - otherwise exactly one `withTimeout(llm.completeStructured({ model, schema: OnboardingLlmOutput, schemaName, messages, maxRetries: LLM_MAX_RETRIES, timeoutMs: LLM_TIMEOUT_MS }), LLM_TIMEOUT_MS)` (AC-43, AC-45, AC-47);
         - classify: timeout error → `timeout`; schema/parse failure after repair → `invalid_output` "AI output invalid" (AC-46); anything else → `failed` "Provider error: …". The implementor checks how each provider surfaces a parse failure (`server/src/adapters/llm/openai.ts:90-110`, `reviewer-core/src/llm/openrouter.ts:61-68`);
         - on success, `mergeAiOutput`;
      5. decide:
         - AI ok → store the `ai` tour with tokens and `cost_usd` from the result (AC-18, NFR-5);
         - AI not ok and the stored tour parses with `mode: 'ai'` → `failGeneration(reason)` and keep the stored tour (AC-22);
         - otherwise store a skeleton tour with `ai.status` and `reason` (AC-23, AC-52);
         - any thrown error in the deterministic or store phases → `failGeneration(message)` and keep the previous tour (NFR-10);
      6. one `logger.info({ repoId, mode, indexStatus, aiStatus, aiReason, tokensIn, tokensOut, costUsd, durations: { facts, hotness, skeleton, llm, store, total } }, 'onboarding generation')` (NFR-12).

      Index status mapping (AC-54, AC-55): `full`, `partial` or `degraded` (including flag-off); `files_total = filesIndexed + filesSkipped`; `degraded_reason` from the state or `flag_off`.

      Use the injected clock for `generated_at` and the window, so two runs are identical apart from timestamps (NFR-11).
    - **`reapInterruptedGenerations()`** for `app.ts` (AC-24).
  - **`routes.ts`:** the three routes listed in Architecture notes, each with `params: IdParams` and `response` schemas from `@devdigest/shared`. No public or token routes (AC-61, NFR-6). Pass `app.log` into the service.
  - **`app.ts`:** call the reaper right after the existing stale-run reaper, non-fatal, with a log line.
- **Tests (planned from ACs)**:
  - **`onboarding-service.test.ts`** (hermetic; cast `Container` stub with a `repoIntel` stub, a counting LLM stub implementing `LLMProvider`, a `priceBook` stub, an in-memory repository injected via `opts.repo`, a fixed clock, a captured logger):
    - AI generation makes 1 call; skeleton-skipped and not-configured make 0 (AC-43, AC-48, NFR-4);
    - an override model is passed to the stub (AC-45);
    - malformed output gives `invalid_output` with reason (AC-46);
    - an erroring stub gives `failed` "Provider error"; a stub that never resolves under fake timers gives `timeout` (AC-47);
    - estimate, read and generate-when-not-ready make 0 calls (NFR-4);
    - a `touchCounts` throw gives a stored skeleton with hotness 0 and a note; a facts throw gives `failed` with the previous tour kept (NFR-10);
    - a double run with the same inputs gives deep-equal tours apart from `generated_at` (NFR-11);
    - exactly one log line with every field (NFR-12).
  - **`onboarding.it.test.ts`** (testcontainers; `startPg`/`seed`/`buildApp` like `server/test/skill-stats.it.test.ts`; a repo row whose `clonePath` is a tmp fixture dir with `package.json`, `pnpm-lock.yaml`, `.env.example` and `docker-compose.yml`; seeded `repo_index_state`, `file_rank`, `file_edges`, `symbols`, `file_facts`, PRs and `pr_files`; an LLM stub injected via `overrides.llm`):
    - a foreign-workspace repo gives 404 on all three routes (AC-12, NFR-6);
    - a legacy-shaped `json` row gives `tour: null` (AC-13);
    - POST generate returns `generating` within 1,000 ms (AC-14);
    - two concurrent POSTs give one stub call and both responses `generating` (AC-17);
    - after completion, GET returns `commit_sha`, `generated_at`, `mode`, provider, model, tokens and `cost_usd` equal to the stub's cost; a second generation replaces the first (AC-18, NFR-5);
    - an index commit different from the tour gives `stale: true`, equal gives false (AC-20 API);
    - GET plus `POST /repos/:id/resync` give 0 stub calls and no `json` (AC-21);
    - a stored `ai` tour plus a failing stub leaves the tour unchanged and returns `generation.state: failed` with the reason (AC-22);
    - no tour plus a failing stub stores `mode: skeleton` with `ai.reason` set and all five sections non-empty (AC-23, AC-52);
    - a seeded `generating` row, then booting the app, gives `failed` and a new generate is accepted (AC-24);
    - PRs inside and outside 180 days, including null `updated_at`, give the expected touch counts (AC-30);
    - LLM stub output that reorders or adds files, adds `curl | sh`, keys text to an unknown path, or proposes task `nope/x.ts` is absent from the stored tour (AC-32, AC-35, AC-40, AC-49);
    - all tasks invalid gives the deterministic tasks (AC-41);
    - `file_rank` rows are identical before and after generation (AC-33);
    - the estimate has `model`, `est_input_tokens` and `est_cost_usd` (null for an unpriced model) (AC-16 API);
    - a workspace override in the `settings` table reaches the stub's provider and model (AC-45);
    - no clone or a `failed` index gives 409 `index_not_ready` and 0 calls (AC-56);
    - a zero-edge fixture gives `reading_path.graph_available: false` and the other sections present (AC-57);
    - a route inventory over `app.printRoutes()` has every new route under `/repos/:id/onboarding*` and nothing unauthenticated (AC-61);
    - GET on a seeded tour completes in under 500 ms (NFR-1);
    - a 5,000-file seeded index gives logged durations with facts+hotness+skeleton under 5,000 ms and the total (instant stub) under 90,000 ms (NFR-2).
- **Acceptance criteria**: `scripts/verify.sh server src/modules/onboarding/service.ts src/modules/onboarding/routes.ts src/app.ts` is green; the `.it` file passes under `--full` with Docker (it self-skips without Docker; server INSIGHTS 2026-07-29); depcruise reports no new violation.

### Step 6: Sidebar nav item and active key
- **Domain**: frontend
- **Module(s)**: `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/`
- **Files likely touched**: `client/src/vendor/ui/nav.ts` (the agreed exception, Q1), `client/src/components/app-shell/helpers.ts`, new `client/src/components/app-shell/helpers.test.ts`, new `client/src/components/app-shell/AppShell.test.tsx`
- **Covers**: AC-1, AC-2, AC-3
- **Required skills**: frontend-ui-architecture, react-testing-library
- **Depends on**: none
- **Can run in parallel with**: Steps 1, 2, 3
- **What to do**:
  - Insert `{ key: "onboarding-tour", label: "Onboarding Tour", icon: <an existing IconName from vendor/ui icons, e.g. a map or compass glyph>, href: "/repos/:repoId/onboarding" }` between `pulls` and `context`. Add no gKey.
  - Remove the duplicated `g x` `SHORTCUTS` row.
  - Change `activeKeyFor` to `if (/^\/repos\/[^/]+\/onboarding(\/|$)/.test(pathname)) return "onboarding-tour";`, so `/onboarding` falls through to `""`.
  - The `shell.json` label already exists (`client/messages/en/shell.json:19`).
- **Tests (planned from ACs)**:
  - `helpers.test.ts`: `NAV[0].items` keys are `["pulls","onboarding-tour","context"]` and the href is templated (AC-1); `activeKeyFor('/repos/r1/onboarding') === 'onboarding-tour'` (AC-2); `activeKeyFor('/onboarding') === ''` (AC-3).
  - `AppShell.test.tsx`, with `useActiveRepo`, `usePulls` and `usePathname` mocked: the WORKSPACE link "Onboarding Tour" has `href="/repos/r1/onboarding"` and sits between Pull Requests and Project Context (AC-1); it is marked active on `/repos/r1/onboarding` (AC-2) and not on `/onboarding` (AC-3).
- **Acceptance criteria**: `scripts/verify.sh client src/components/app-shell/helpers.ts src/vendor/ui/nav.ts` is green; no other `vendor/ui` edits.

### Step 7: Client data hooks, message catalog, page shell, header, banners, "On this page", section cards
- **Domain**: frontend
- **Module(s)**: `client/src/lib/hooks/`, `client/messages/en/`, `client/src/app/repos/[repoId]/onboarding/`
- **Files likely touched**:
  - new: `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/onboarding.test.ts`
  - edit: `client/src/lib/hooks/index.ts` (only if hooks are re-exported there)
  - rewrite: `client/messages/en/onboarding.json` (this step owns **all** keys, including those Step 8 uses)
  - new: `client/src/app/repos/[repoId]/onboarding/page.tsx` (thin), `constants.ts` (section ids and anchors, poll interval 3000)
  - new `_components/`: `OnboardingTourView/{OnboardingTourView.tsx,styles.ts,index.ts,OnboardingTourView.test.tsx}`, `TourHeader/{…,TourHeader.test.tsx}`, `StatusBanners/{…,StatusBanners.test.tsx}`, `OnThisPage/{…,OnThisPage.test.tsx}`, `SectionCard/{…,SectionCard.test.tsx}`
  - new `_hooks/`: `useSectionAnchor.ts`, `useClipboardCopy.ts` (shared with Step 8)
  - new: `_components/sections/index.ts`, plus **stub** section components with the agreed props (Step 8 replaces their bodies)
- **Covers**: AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12 (UI), AC-15, AC-16 (UI), AC-19, AC-20 (UI), AC-22 (banner), AC-53 (badge), AC-54, AC-55, AC-56 (UI), AC-58, AC-59, AC-60; NFR-3, NFR-8 (header and banners), NFR-9 (header, nav, toggles, focus, live region); Localisation
- **Required skills**: frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security
- **Depends on**: Step 1
- **Can run in parallel with**: Step 4
- **What to do**:
  - **Hooks:**
    - `useOnboarding(repoId)`: `GET /repos/:id/onboarding`, with `refetchInterval: (q) => q.state.data?.generation.state === 'generating' ? 3000 : false` (NFR-3).
    - `useOnboardingEstimate(repoId, enabled)`.
    - `useGenerateOnboarding(repoId)`: a POST mutation that invalidates `["onboarding", repoId]`. `ApiError` code `index_not_ready` is surfaced.
    - Types come from `@devdigest/shared`.
  - **Messages:** rewrite `onboarding.json` with these key groups: title, breadcrumb, header (`title "Onboarding for {name}"`, `subtitle`, `subtitlePartial "{indexed} of {total} files indexed (partial)"`, `generatedAgo`, `meta` model/cost/`noAiCall`, `stale`, `regenerate`, `generate`, `estimate` cost/tokens-only, `generating`), `share` (`button`, `copied`, `fallbackLabel`), `onThisPage`, `sections.*.title` (5), `provenance.ai "AI-written"` and `provenance.index "From index"`, `banners.*` (partial / degraded / ai failed / not configured / timeout / invalid / `regenerationFailed "Regeneration failed: {reason}"`), `empty.*`, `loading`, `loadError` with retry, `notReady.*` with resync, `architecture.diagramAlt`/`moreFolders "+{count} more folders"`/`noGraph "No import graph available"`, `critical.open "Open {path} on GitHub"`, `run.copy "Copy command: {command}"`/`run.copied`/`run.noRootManifest "No runnable manifest detected at the repo root"`, `reading.noPrActivity "no PR activity — ordered by import graph only"`, `tasks.complexity.{low,medium,high} "Low complexity" …`. No add-repo copy is touched.
  - **`page.tsx`** renders `<OnboardingTourView repoId=…/>` inside `AppShell` with crumb `[{label: full_name, mono:true}, {label: t("title")}]` (AC-4).
  - **`OnboardingTourView`** states, in priority order:
    - `useRepoNotFound` → `<RepoNotFound/>` (AC-12);
    - loading → skeletons (AC-10);
    - error → `ErrorState` with retry calling `refetch` (AC-11);
    - `!index_ready` → "index not ready" with a resync action (the existing hook in `client/src/lib/hooks/repo-intel.ts`) and Generate disabled (AC-56);
    - `tour === null` → empty state with Generate, the model and the estimate, and no cards (AC-9);
    - otherwise the two-column layout from the screenshot: a left "ON THIS PAGE" rail and a right column with header, banners and five `SectionCard`s in order (AC-5, AC-6).

    While `generating`: a progress indicator, Generate and Regenerate disabled, and the previous tour still visible (AC-15).
  - **`TourHeader`**, matching the screenshot:
    - "Onboarding for **<name>**" with the name in the accent colour;
    - subtitle "Generated from index of N files · last refreshed {ago}", or the partial form (AC-5, AC-55), using `relativeAgo` from `@/components/project-context`;
    - meta line: model and actual cost, or "no AI call" (AC-19), plus the stale badge with a regenerate prompt (AC-20);
    - right side: Regenerate (`RefreshCw`) with the inline estimate "model · ≈ $X", or "≈ N tokens" when the price is null (AC-16, Q8), and Share link.
  - **Share link:** copies `${origin}/repos/${id}/onboarding${location.hash}` (AC-58) and shows a toast plus a `role="status"` live region (NFR-9). If the clipboard rejects or is unavailable, a read-only selectable `<input>` shows the URL (AC-59). Use `useClipboardCopy`. No new API call (AC-61).
  - **`StatusBanners`:** a banner when `index.status` is partial (with the counts) or degraded, or `tour.mode === 'skeleton'`, naming the index status and the AI reason (AC-54). Also "Regeneration failed: {reason}" when `generation.state === 'failed'` (AC-22). Text, not colour alone (NFR-9).
  - **`SectionCard`:**
    - a header `<button aria-expanded aria-controls>` with the icon tile, the title and a chevron, toggled by click, Enter or Space (AC-8);
    - a provenance badge with text (AC-53);
    - the heading has `id=<anchor>` and `tabIndex={-1}`;
    - the body is passed as children.
  - **`useSectionAnchor`:**
    - clicking an "On this page" entry expands the section, calls `scrollIntoView`, and sets `history.replaceState` to `#anchor` (AC-7);
    - on mount with a known `location.hash`, it expands, scrolls and focuses the heading (AC-60, NFR-9);
    - an unknown fragment does nothing.
  - **Stub sections:** `_components/sections/index.ts` exports `ArchitectureSection`, `CriticalPathsSection`, `RunLocallySection`, `ReadingPathSection` and `FirstTasksSection`, each with props `{ tour: Onboarding; repoFullName: string }`, as minimal placeholder bodies for Step 8 to replace.
  - Styling follows `client/src/app/repos/[repoId]/context/styles.ts` tokens (`var(--bg-*)`, `var(--accent)`, `.mono`). No hard-coded copy.
- **Tests (planned from ACs)** (RTL; `next/navigation`, hooks and the clipboard mocked):
  - **`OnboardingTourView.test.tsx`:**
    - the crumb is "owner/name › Onboarding Tour" (AC-4);
    - a stored-tour fixture shows the header, subtitle and the five titles in order (AC-5);
    - a pending query shows the loading state (AC-10);
    - a rejected query shows the error with retry calling `refetch` (AC-11);
    - repo not found renders `RepoNotFound` (AC-12);
    - the no-tour response shows the empty state with Generate, model and estimate and no cards (AC-9);
    - a `generating` fixture shows progress, disabled buttons and the old tour still visible (AC-15);
    - `index_ready: false` shows the not-ready state with resync and Generate disabled (AC-56);
    - clicking an On-this-page entry expands the section, calls `scrollIntoView` and sets `location.hash` (AC-7);
    - `#reading-path` on mount expands the section and focuses its heading (AC-60);
    - AI, skeleton and mixed fixtures show the right badge text per card (AC-53).
  - **`TourHeader.test.tsx`:**
    - the model and estimated USD show next to Regenerate, or tokens only when `est_cost_usd` is null (AC-16);
    - the actual model and cost show, or "no AI call" (AC-19);
    - the stale badge shows when stale and is absent otherwise (AC-20);
    - `files_indexed: 5000, files_total: 12450` partial gives "5000 of 12450 files indexed (partial)" (AC-55, matched by digits, not the spaced format);
    - Share copies the URL plus `#anchor` and a toast or live region appears (AC-58);
    - a rejecting clipboard shows the read-only field with the URL (AC-59).
  - **`StatusBanners.test.tsx`:** one fixture each for partial, degraded, ai-failed and ai-not-configured, each with its text (AC-54); the regeneration-failed banner (AC-22).
  - **`OnThisPage.test.tsx`:** five entries whose labels equal the section titles, keyboard-operable (AC-6, NFR-9).
  - **`SectionCard.test.tsx`:** Enter and Space toggle; `aria-expanded` reflects the state (AC-8, NFR-9).
  - **`lib/hooks/onboarding.test.ts`:** with fake timers wrapped in `act()` (client INSIGHTS 2026-08-04), polling happens every 3 s while `generating` and stops at `idle` or `failed` (NFR-3).
- **Acceptance criteria**: `scripts/verify.sh client <touched files>` is green; `page.tsx` contains no feature logic; every string comes from `onboarding.json`.

### Step 8: Section bodies (architecture prose and diagram, critical paths, run locally, reading path, first tasks)
- **Domain**: frontend
- **Module(s)**: `client/src/app/repos/[repoId]/onboarding/_components/`
- **Files likely touched**: `_components/sections/**` (replaces the Step 7 stubs, keeping their export names and props), new `_components/TourMarkdown/{TourMarkdown.tsx,TourMarkdown.test.tsx,index.ts}`, new `_components/ArchitectureDiagram/{ArchitectureDiagram.tsx,layout.ts,layout.test.ts,ArchitectureDiagram.test.tsx,styles.ts,index.ts}`, and section tests `_components/sections/*.test.tsx`. **Not** `onboarding.json` (consume Step 7's keys; if a key is missing, report it rather than adding a parallel one), and **not** the Step 7 components.
- **Covers**: AC-25 (render), AC-27, AC-28 (UI rows), AC-31 (copy), AC-36, AC-37, AC-38 (UI), AC-39 (UI), AC-41 (badge), AC-50 (UI), AC-51, AC-57 (copy), AC-62; NFR-8, NFR-9 (icon controls, badge text, diagram alternative, copy live region)
- **Required skills**: frontend-ui-architecture, react-best-practices, react-testing-library, security
- **Depends on**: Step 7
- **Can run in parallel with**: Step 5
- **What to do**, matching the screenshot:
  - **`TourMarkdown`:** `react-markdown` with `remark-gfm` and `skipHtml`, and no `rehype-raw`.
    - The custom `code` renderer: an inline code span matching the path-like regex renders as `<a className="mono" href={githubBlobUrl(full_name, commit_sha, path)} target="_blank" rel="noopener noreferrer">` (the server guarantees these are indexed, AC-50). Other code renders as plain `<code>`.
    - `a` renders its children as plain text (Q9).
    - `img` renders nothing.
  - **`ArchitectureSection`:** `TourMarkdown` for `summary_md`, stack chips, then `ArchitectureDiagram`.
  - **`ArchitectureDiagram`:**
    - `layout.ts` is a pure layered layout: entry column, then folder column(s), then service column.
    - Boxes are DOM elements with a border colour per kind (entry accent, folder neutral, service green, as in the screenshot) and an SVG overlay for edges.
    - Labels are React text nodes only (AC-27).
    - A "+N more folders" note.
    - "No import graph available" when there are no folder edges and `reading_path.graph_available` is false (AC-57).
    - A visually hidden `<ul>` listing the nodes and edges as the text alternative (NFR-9).
  - **`CriticalPathsSection`:** rows with a file icon, the mono path (CSS ellipsis, full path in `title`), "— reason", and an "Open" link button to `githubBlobUrl(repoFullName, tour.commit_sha, path)` with `target="_blank" rel="noopener noreferrer"` and `aria-label` "Open <path> on GitHub" (AC-28, AC-62, NFR-9).
  - **`RunLocallySection`:**
    - numbered rows: step number, mono command, and a separate muted note element (AC-36);
    - a copy `IconBtn` with `aria-label` "Copy command: <command>" that copies exactly `step.command` (AC-37) through `useClipboardCopy`, with the same read-only fallback field on failure and a live-region confirmation;
    - `no_root_manifest` gives the message plus the `manifests_found` list (AC-38).
  - **`ReadingPathSection`:** numbered circles, mono path, muted `why` line. "no PR activity — ordered by import graph only" when `!hotness_available` (AC-31). "No import graph available" when `!graph_available` (AC-57).
  - **`FirstTasksSection`:** a responsive 3-column card grid with title, mono `path_hint` and a complexity badge whose text reads "Low/Medium/High complexity", coloured but readable as text (AC-39, NFR-9). The section's provenance badge shows "From index" when the tasks are deterministic (AC-41, via `SectionCard`).
- **Tests (planned from ACs)**:
  - **`TourMarkdown.test.tsx`:** a known path code span is a link to the blob URL, while text that the server already made plain is not linked (AC-50). `<script>` and `<img onerror>` in AI text leave no `script`/`img` element in the DOM, and `[x](javascript:…)` renders as text (AC-51, NFR-8).
  - **`layout.test.ts`:** the fixture node and edge positions are deterministic.
  - **`ArchitectureDiagram.test.tsx`:** a folder named `<img src=x onerror=…>` renders literally (AC-27); the nodes from the fixture are present (AC-25 render); "+3 more folders" shows; the text alternative lists the nodes and edges (NFR-9).
  - **`CriticalPathsSection.test.tsx`:** the row path and reason render (AC-28); the Open href is `https://github.com/o/n/blob/<commit>/<path>` with `target=_blank` and `rel` containing `noopener` (AC-62).
  - **`RunLocallySection.test.tsx`:** the note is rendered outside the command element (AC-36); the copy button writes exactly the command, without the number or note, to the mocked clipboard (AC-37); a rejecting clipboard shows the fallback field; no root manifest shows the message and up to 5 paths (AC-38).
  - **`ReadingPathSection.test.tsx`:** numbered items; the no-PR-activity copy (AC-31); the no-graph copy (AC-57).
  - **`FirstTasksSection.test.tsx`:** 3–5 cards with title, path hint and complexity text from an AI fixture (AC-39); the deterministic fixture shows "From index" (AC-41).
- **Acceptance criteria**: `scripts/verify.sh client <touched files>` is green; no `dangerouslySetInnerHTML`; no `vendor/ui` edits.

### Step 9: E2E flow, sidebar to the Onboarding Tour page
- **Domain**: e2e
- **Module(s)**: `e2e/`
- **Files likely touched**: new `e2e/specs/08-onboarding-tour.flow.json`, edit `e2e/README.md` (the flow table)
- **Covers**: AC-1, AC-4 (browser-level); AC-56 or AC-9 (whichever state the hermetic seed produces); NFR-4 (no LLM in the loop)
- **Required skills**: none from the table. Read `e2e/README.md` and `e2e/INSIGHTS.md` first.
- **Depends on**: Steps 5, 6, 7, 8
- **Can run in parallel with**: Step 10
- **What to do**:
  - Open `{BASE}/`, wait for the sidebar text "Onboarding Tour", and click it using the README's `find` locator form.
  - Wait for a `--url` containing `/onboarding` and then the breadcrumb text "Onboarding Tour", so the add-repo page (which shows "Add a repository") is not mistaken for it.
  - Wait for the deterministic state text the hermetic seed produces. Check the seed: no clone means the "index not ready" copy; an indexed clone with no tour means the "Generate" empty-state copy.
  - Never click Generate. Use no `chat` command.
  - Add a row to the README table.
- **Acceptance criteria**: `cd e2e && npm run e2e:hermetic` passes, including the existing `06-onboarding` flow (unchanged, add-repo).

### Step 10: Docs and INSIGHTS
- **Domain**: backend + frontend docs
- **Module(s)**: `server/README.md`, `server/src/modules/repo-intel/README.md`, `client/README.md`, root `INSIGHTS.md`, `server/INSIGHTS.md`
- **Files likely touched**: those five files only. Never `specs/**`.
- **Covers**: infra (accepted Rec 10, plus the spec's follow-up recommending an INSIGHTS entry)
- **Required skills**: doc-writer, engineering-insights
- **Depends on**: Steps 1–8
- **Can run in parallel with**: Step 9 (no shared files)
- **What to do**:
  - Add the `onboarding` routes and the boot reaper to the `server/README.md` API map.
  - Add `getOnboardingFacts` to the repo-intel README facade list, and state that the tour applies hotness at read time only, with `rank.ts` still Option B.
  - Add `/repos/:repoId/onboarding` to the `client/README.md` route map.
  - Through `engineering-insights`, record in root `INSIGHTS.md` (Codebase Patterns, under the 2026-08-05 pre-staged entry) the spec's finding: the staged onboarding scaffolding conflicted with the shipped shape, and it was replaced.
  - In `server/INSIGHTS.md`, record two things:
    - `JobRunner`'s 2 retries make it unsafe for any "exactly one LLM call" job;
    - the summary path normalisation that makes AC-50 work with no contract change.
- **Acceptance criteria**: the docs match the code; no `specs/**` edits.

## Coverage

| Spec ID | Step(s) | Planned test (package · file · kind) |
|---|---|---|
| AC-1 | 6, 9 | client · `components/app-shell/helpers.test.ts`, `AppShell.test.tsx` · unit; e2e · `08-onboarding-tour.flow.json` |
| AC-2 | 6 | client · `helpers.test.ts`, `AppShell.test.tsx` · unit |
| AC-3 | 6 | client · `helpers.test.ts`, `AppShell.test.tsx` · unit |
| AC-4 | 7, 9 | client · `OnboardingTourView.test.tsx` · unit; e2e flow |
| AC-5 | 1, 7 | client · `OnboardingTourView.test.tsx` · unit |
| AC-6 | 7 | client · `OnThisPage.test.tsx` · unit |
| AC-7 | 7 | client · `OnboardingTourView.test.tsx` · unit |
| AC-8 | 7 | client · `SectionCard.test.tsx` · unit |
| AC-9 | 7, 5 | client · `OnboardingTourView.test.tsx` · unit; server · `onboarding.it.test.ts` (estimate) · it |
| AC-10 | 7 | client · `OnboardingTourView.test.tsx` · unit |
| AC-11 | 7 | client · `OnboardingTourView.test.tsx` · unit |
| AC-12 | 5, 7 | server · `onboarding.it.test.ts` (404) · it; client · `OnboardingTourView.test.tsx` · unit |
| AC-13 | 1, 5 | server · `contracts.test.ts` · unit; `onboarding.it.test.ts` (legacy row) · it |
| AC-14 | 5 | server · `onboarding.it.test.ts` (≤ 1,000 ms) · it |
| AC-15 | 7 | client · `OnboardingTourView.test.tsx` · unit |
| AC-16 | 5, 7 | server · `onboarding.it.test.ts`, `onboarding-service.test.ts` · it/unit; client · `TourHeader.test.tsx` · unit |
| AC-17 | 2, 5 | server · `onboarding.it.test.ts` (concurrent POSTs → 1 call) · it |
| AC-18 | 1, 5 | server · `onboarding.it.test.ts` · it |
| AC-19 | 7 | client · `TourHeader.test.tsx` · unit |
| AC-20 | 5, 7 | server · `onboarding.it.test.ts` (`stale`) · it; client · `TourHeader.test.tsx` · unit |
| AC-21 | 5 | server · `onboarding.it.test.ts` (view/resync → 0 calls) · it |
| AC-22 | 5, 7 | server · `onboarding.it.test.ts` · it; client · `StatusBanners.test.tsx` · unit |
| AC-23 | 5 | server · `onboarding.it.test.ts` · it |
| AC-24 | 2, 5 | server · `onboarding.it.test.ts` (seed `generating` → boot → failed) · it |
| AC-25 | 4, 8 | server · `onboarding-diagram.test.ts`, `onboarding-merge.test.ts` · unit; client · `ArchitectureDiagram.test.tsx` · unit |
| AC-26 | 4 | server · `onboarding-diagram.test.ts` · unit |
| AC-27 | 8 | client · `ArchitectureDiagram.test.tsx` · unit |
| AC-28 | 4, 8 | server · `onboarding-critical-paths.test.ts` · unit; client · `CriticalPathsSection.test.tsx` · unit |
| AC-29 | 3, 4 | server · `onboarding-reading-path.test.ts`, `repo-intel-onboarding-facts.test.ts` · unit |
| AC-30 | 4, 5 | server · `onboarding-reading-path.test.ts` · unit; `onboarding.it.test.ts` (window query) · it |
| AC-31 | 4, 8 | server · `onboarding-reading-path.test.ts` · unit; client · `ReadingPathSection.test.tsx` · unit |
| AC-32 | 4, 5 | server · `onboarding-merge.test.ts` · unit; `onboarding.it.test.ts` · it |
| AC-33 | 3, 5 | server · `repo-intel-onboarding-facts.it.test.ts`, `onboarding.it.test.ts` · it |
| AC-34 | 3, 4 | server · `repo-intel-onboarding-facts.test.ts`, `onboarding-run-commands.test.ts` · unit |
| AC-35 | 4, 5 | server · `onboarding-merge.test.ts` · unit; `onboarding.it.test.ts` · it |
| AC-36 | 4, 8 | server · `onboarding-merge.test.ts` · unit; client · `RunLocallySection.test.tsx` · unit |
| AC-37 | 8 | client · `RunLocallySection.test.tsx` · unit |
| AC-38 | 3, 4, 8 | server · `repo-intel-onboarding-facts.test.ts`, `onboarding-run-commands.test.ts` · unit; client · `RunLocallySection.test.tsx` · unit |
| AC-39 | 4, 8 | server · `onboarding-merge.test.ts` · unit; client · `FirstTasksSection.test.tsx` · unit |
| AC-40 | 4, 5 | server · `onboarding-merge.test.ts` · unit; `onboarding.it.test.ts` · it |
| AC-41 | 4, 5, 8 | server · `onboarding-merge.test.ts` · unit, `onboarding.it.test.ts` · it; client · `FirstTasksSection.test.tsx` · unit |
| AC-42 | 4 | server · `onboarding-first-tasks.test.ts` · unit |
| AC-43 | 5 | server · `onboarding-service.test.ts` (call counts) · unit; `onboarding.it.test.ts` · it |
| AC-44 | 4 | server · `onboarding-llm-input.test.ts` · unit |
| AC-45 | 5 | server · `onboarding-service.test.ts` · unit; `onboarding.it.test.ts` (settings override) · it |
| AC-46 | 5 | server · `onboarding-service.test.ts` · unit |
| AC-47 | 5 | server · `onboarding-service.test.ts` (erroring and slow stub, fake timers) · unit |
| AC-48 | 5 | server · `onboarding-service.test.ts` (0 calls, reason) · unit |
| AC-49 | 4, 5 | server · `onboarding-merge.test.ts` · unit; `onboarding.it.test.ts` · it |
| AC-50 | 4, 8 | server · `onboarding-merge.test.ts` (summary path normalisation) · unit; client · `TourMarkdown.test.tsx` · unit |
| AC-51 | 8 | client · `TourMarkdown.test.tsx` · unit |
| AC-52 | 4, 5 | server · `onboarding-skeleton.test.ts` · unit; `onboarding.it.test.ts` (failing stub → 5 sections) · it |
| AC-53 | 4, 7 | server · `onboarding-merge.test.ts`, `onboarding-skeleton.test.ts` · unit; client · `OnboardingTourView.test.tsx` · unit |
| AC-54 | 5, 7 | server · `onboarding-service.test.ts` (status mapping) · unit; client · `StatusBanners.test.tsx` · unit |
| AC-55 | 5, 7 | server · `onboarding-service.test.ts` (`files_total`) · unit; client · `TourHeader.test.tsx` · unit |
| AC-56 | 3, 5, 7, 9 | server · `onboarding.it.test.ts` (409, 0 calls) · it; client · `OnboardingTourView.test.tsx` · unit; e2e flow (if the seed has no clone) |
| AC-57 | 3, 4, 5, 8 | server · `repo-intel-onboarding-facts.test.ts`, `onboarding-diagram.test.ts`, `onboarding-reading-path.test.ts` · unit, `onboarding.it.test.ts` · it; client · `ReadingPathSection.test.tsx`, `ArchitectureDiagram.test.tsx` · unit |
| AC-58 | 7 | client · `TourHeader.test.tsx` · unit |
| AC-59 | 7 | client · `TourHeader.test.tsx` · unit |
| AC-60 | 7 | client · `OnboardingTourView.test.tsx` · unit |
| AC-61 | 5 | server · `onboarding.it.test.ts` (route inventory) · it |
| AC-62 | 8 | client · `CriticalPathsSection.test.tsx` · unit |
| AC-63 | 3 | server · `repo-intel-onboarding-facts.test.ts` · unit |
| NFR-1 | 5 | server · `onboarding.it.test.ts` (GET < 500 ms, single run) · it |
| NFR-2 | 3, 5 | server · `onboarding.it.test.ts` (5,000-file fixture; deterministic phases < 5 s, total < 90 s from logged durations) · it |
| NFR-3 | 7 | client · `lib/hooks/onboarding.test.ts` (fake timers) · unit |
| NFR-4 | 5, 9 | server · `onboarding-service.test.ts` (0 calls for read, estimate, not-ready, not-configured) · unit; e2e flow (no LLM) |
| NFR-5 | 5, 7 | server · `onboarding.it.test.ts` (`cost_usd` equals stub cost; estimate present) · it; client · `TourHeader.test.tsx` · unit |
| NFR-6 | 5 | server · `onboarding.it.test.ts` (foreign workspace → 404) · it |
| NFR-7 | 4 | server · `onboarding-llm-input.test.ts` · unit |
| NFR-8 | 7, 8 | client · `TourMarkdown.test.tsx`, `ArchitectureDiagram.test.tsx` · unit |
| NFR-9 | 7, 8 | client · `SectionCard.test.tsx`, `OnThisPage.test.tsx`, `OnboardingTourView.test.tsx` (focus), `TourHeader.test.tsx` (live region), section tests (accessible names), `ArchitectureDiagram.test.tsx` (text alternative) · unit |
| NFR-10 | 5 | server · `onboarding-service.test.ts` (touch counts, facts and LLM fail) · unit; `onboarding.it.test.ts` (AC-22/23/24) · it |
| NFR-11 | 4, 5 | server · `onboarding-diagram.test.ts` · unit; `onboarding-service.test.ts` (double run) · unit |
| NFR-12 | 5 | server · `onboarding-service.test.ts` (captured log line) · unit |

Nothing is deferred.

## Execution guidance (multi-agent)
- **Batch 1 (4 concurrent `implementor`s): Steps 1, 2, 3, 6.**
  - File ownership:
    - Step 1: both `vendor/shared/contracts/knowledge.ts` copies, the `vendor/shared/index.ts` twins, `server/test/contracts.test.ts`.
    - Step 2: `server/src/db/schema/context.ts` and `server/src/db/migrations/**`.
    - Step 3: `server/src/modules/repo-intel/**` and `server/test/repo-intel-onboarding-facts*`.
    - Step 6: `client/src/vendor/ui/nav.ts` and `client/src/components/app-shell/**`.
  - No file overlap, so **no worktrees**. Step 2 needs `node_modules` and a DB for `db:generate`/`db:migrate`, so it must run in the main tree.
  - After merging, the session runs `scripts/verify.sh server` and `scripts/verify.sh client` once.
- **Batch 2 (2 concurrent): Steps 4 and 7.** Step 4 owns the new pure files in `server/src/modules/onboarding/`, `server/src/prompts/onboarding.system.md` and the eight `server/test/onboarding-*.test.ts` core tests. Step 7 owns `client/src/lib/hooks/onboarding*`, `client/messages/en/onboarding.json` and `client/src/app/repos/[repoId]/onboarding/**`, including the section stubs. Different packages, so no worktrees.
- **Batch 3 (2 concurrent): Steps 5 and 8.**
  - Step 5 owns `server/src/modules/onboarding/{repository,service,routes,helpers}.ts`, `server/src/modules/index.ts`, `server/src/app.ts`, `server/test/onboarding-service.test.ts` and `server/test/onboarding.it.test.ts`. It may add to the Step 4 files but must not change their tested behaviour.
  - Step 8 owns `…/onboarding/_components/{sections,TourMarkdown,ArchitectureDiagram}/**`. It must not edit `onboarding.json` or the Step 7 components; it reports any missing message key instead.
  - Different packages, so no worktrees. The session runs `scripts/verify.sh server --full` (Docker lane) and `scripts/verify.sh client` after the merge.
- **Batch 4 (2 concurrent): Steps 9 and 10.** Step 9 owns `e2e/specs/08-onboarding-tour.flow.json` and `e2e/README.md`. Step 10 owns the four docs files and the two INSIGHTS files. They are disjoint.
- **Cross-step contracts that implementors must not change unilaterally:**
  - the `OnboardingFacts` shape (Step 3 defines it, Steps 4 and 5 consume it);
  - the section stub props `{ tour: Onboarding; repoFullName: string }` (Step 7 defines them, Step 8 implements them);
  - the message keys (Step 7);
  - the reason strings and caps in `onboarding/constants.ts` (Step 4).

  If one must change, the implementor stops and reports back.
- **For the Codex review**, the riskiest points to check:
  1. Atomicity of the `claimGeneration` upsert.
  2. How each provider surfaces a schema failure versus a transport error. This drives the `invalid_output` vs `failed` classification.
  3. That `withTimeout` abandons a late result without writing it.
  4. The AC-39 minimum-3 handling (Assumptions).
  5. The "skipped" definition (Assumptions).
  6. Whether `GET /repos/:id/onboarding` stays under 500 ms without gathering facts.

## Definition of done
- Per step while building: `scripts/verify.sh <pkg> <touched files>`. `server/` and `client/` use **pnpm**; `e2e/` uses **npm**; never mix them. reviewer-core is not modified.
- Schema: `cd server && pnpm db:generate && pnpm db:migrate`, with `✓ migrations applied` on the dev DB.
- After all steps land, once per touched package:
  - `scripts/verify.sh server --full` (includes the `*.it.test.ts` Docker lane; a skip without Docker does not count as passing, per server INSIGHTS 2026-07-29)
  - `scripts/verify.sh client --full`
  - `cd e2e && npm run e2e:hermetic`
- Typecheck is clean: `cd server && pnpm typecheck`, `cd client && pnpm typecheck`.
- Gates, in the order `/implement-plan` encodes:
  1. `plan-verifier` against the spec and this plan. Every Coverage row must be covered and tested; nothing is deferred.
  2. `pr-self-review` before any PR.
  3. `engineering-insights` (Step 10 records the main entries; add anything else non-obvious from the build).
- Spec housekeeping (`Plan:`, `Status:`) is left to you. This plan does not edit the spec.
