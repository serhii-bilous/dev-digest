# Implementation plan: Local LLM provider (Claude Code CLI, subscription)

**Execution mode:** multi-agent (chosen by the user)
**Requirements source:** `specs/2026-10-27-local-claude-provider.md`. This plan reads it and does not modify it.
**Spec ID:** SPEC-2026-10-27-local-claude-provider
**Branch:** `feat/LAB5-local-claude-provider`

## Overview
Add a fourth agent provider, `local`, that sends the agent's review call to the Claude Code CLI as a sandboxed child process. The process authenticates with a `claude setup-token` OAuth token stored in DevDigest secrets. Local offers `opus|sonnet|haiku` only when the CLI is present and a token is configured. Runs go through the unchanged reviewer-core pipeline (wrapping, reprompt, grounding). Each run records `cost_usd = 0` and `billing = subscription`. At most 2 calls run per process, each capped at 300 s, and failures carry typed reasons.

## Assumptions
These are planner defaults. Nothing in the spec or the user's answers fixes them.
- **Secret key name:** the token is stored under the new secret key `LOCAL_CLAUDE_OAUTH_TOKEN` (secrets file, then env fallback of the same name). It is passed to the child process only as `CLAUDE_CODE_OAUTH_TOKEN`. A `CLAUDE_CODE_OAUTH_TOKEN` already set in the host shell does **not** count, which keeps AC-4 strict.
- **Reason in the error text:** a failed Local run's `error` text is formatted `"<reason>: <message>"`, so the reason reaches MCP through the existing `shapeRunStatus` (`mcp-server/src/shape.ts:47`) with no mcp-server code change (AC-34). The reason is also stored in the new `failure_reason` column.
- **CI export:** the repo has no studio-side CI YAML writer today (`AgentManifest` is referenced only in shared contracts and in a reviewer-core comment). So "block with message" is enforced in the `AgentManifest` contract: parsing `provider: "local"` fails with the message `Local agents can't run in CI`.
- **Availability probe:** the probe (`claude --version`, 2 s timeout) is cached for ≤10 s. The token is re-read from secrets on every call, so AC-15 holds without a restart.
- **Kill sequence:** SIGTERM on cancel, timeout or shutdown, then SIGKILL after a 2 s grace. That stays within the 5 s of AC-31 and NFR-7.
- **Rate-limit reset time:** passed through as the CLI's own text (for example `resets 3:45pm`), not parsed into a timestamp.
- **Token counts on failure:** a failed Local run stores `tokens_in/out = null`. Failure handling for the other providers is unchanged (0).

## Accepted recommendations
1. Split the enum: `Provider` (agent-facing, includes `local`) plus a new `ApiProvider` (without it) for feature models and the CI manifest → Step 1.
2. Accept 422 at the schema level for AC-10 and AC-44 → Steps 1 and 6.
3. CI manifest rejects `local` with "Local agents can't run in CI" → Step 1.
4. Save-only `POST /settings/secrets {provider:'local', key}`, 20/min, no model call → Step 6.
5. Queued state kept in memory (`queued_for_local` on `RunSummary`, plus an info event); no DB status → Steps 3, 4 and 7.
6. One migration: `agent_runs.failure_reason`, and `billing` (default `'api'`) on both `agent_runs` and `eval_runs` → Step 2.
7. Cancel ACs apply to reviews only. Evals keep the 300 s timeout and the slot cap → Step 7.
8. `tokensIn/Out` widened to `number | null` (type only) → Step 1.
9. Docker: `npm install -g @anthropic-ai/claude-code@2.1.296` (fallback 2.1.290), optional deps allowed → Step 5.
10. CLI research is folded into Step 3, including an explicit verification task.
11. Run-scoped Local provider (`container.llmFor`) instead of changing reviewer-core → Steps 3, 6 and 7.
12. Child env allowlist plus temp `HOME`/`CLAUDE_CONFIG_DIR`/working directory → Step 3.
13. Local native `ProviderSelect` with disabled options; `@devdigest/ui` stays untouched → Step 9.
14. Contracts change first, in both shared copies, in one step → Step 1.

## Module impact map
- `server/src/vendor/shared/` and `client/src/vendor/shared/` (`@devdigest/shared`) — provider enums, Local types, billing and reason fields, nullable token counts. Checked root `INSIGHTS.md:198-208` (the client copy lags the server copy). No specs/docs exist for the shared package.
- `reviewer-core/` — type-only change: `ReviewOutcome.tokensIn/Out` become `number | null`. Checked `reviewer-core/CLAUDE.md`; no specs/docs entries apply.
- `server/src/db/schema/` and `server/src/db/migrations/` — one migration adding three columns. Checked `server/CLAUDE.md`, which says migrations are never hand-edited and are not applied on boot.
- `server/src/adapters/llm/local/` (new) — CLI runner, slot gate, availability probe, failure classifier, `LocalClaudeProvider`. Checked `server/INSIGHTS.md`; it has no CLI or subprocess entries.
- `server/src/platform/{container,sse}.ts`, `server/src/app.ts` — wiring, cancel hook, shutdown kill. Checked `server/README.md` (DI flow).
- `server/src/modules/{settings,agents,reviews,evals}/` — status, save and test endpoints, model list, alias guard, run and eval execution, billing and reason persistence. No module specs/docs found beyond the READMEs.
- `server/Dockerfile` (currently untracked) — install the CLI.
- `mcp-server/` — test only (npm). Checked `mcp-server/INSIGHTS.md`.
- `client/src/lib/{hooks,format.ts}`, `client/src/components/`, `client/src/app/{settings,agents,repos}/**`, `client/messages/en/*.json` — Settings row, provider select, warnings and badge, subscription cost, queued text. Checked `client/CLAUDE.md` (next-intl, hooks-only data access) and `client/INSIGHTS.md`.

## Architecture notes
These follow the `onion-architecture` skill.
- **Domain / contracts:** `@devdigest/shared`. Holds `Provider`/`ApiProvider`, `LOCAL_MODEL_ALIASES`, `LocalFailureReason`, `LocalStatus` and `Billing`. The `LLMProvider` port (`adapters.ts`) gains the `'local'` id.
- **Infrastructure (adapter):** `server/src/adapters/llm/local/`. This is where the `LLMProvider` port is implemented. Process spawning, env construction, temp dirs and CLI envelope parsing stay here. The rest of the server only ever sees `LLMProvider` and `LocalProviderError { reason }`.
- **Composition root:** `container.ts` owns the process-wide `LocalSlotGate` and the runner (including the live-child registry). It exposes:
  - `llmFor(provider, ctx?)`, which returns the API provider or a run-bound `LocalClaudeProvider`. Unavailability throws `LocalProviderError` before any spawn.
  - `localStatus()`.
  - `killLocalProcesses()`.

  The `app.ts` `onClose` hook calls `killLocalProcesses()`.
- **Application:** `ReviewRunExecutor` and the eval runner pass a `LocalRunContext { runId, signal?, onQueued, logger }`. `SettingsService` owns the status, save and test operations.
- **Presentation:** settings and agents routes declare their Zod schemas. Bad input gets 422 from the shared error handler, with no hand-rolled parsing.
- **Platform:** `RunBus` gains an `onCancel(runId, cb)` hook, so the executor can abort the provider's `AbortSignal`.

## Steps

### Step 1 — Shared contracts (both copies) and token-type widening
- **Domain**: backend (cross-package contract)
- **Module(s)**: `server/src/vendor/shared/`, `client/src/vendor/shared/`, `reviewer-core/src/review/`
- **Files likely touched**:
  - `server/src/vendor/shared/{adapters.ts,contracts/knowledge.ts,contracts/platform.ts,contracts/trace.ts,contracts/eval-ci.ts}` and the same files under `client/src/vendor/shared/`
  - `reviewer-core/src/review/run.ts`
  - new `server/src/modules/agents/local-contracts.test.ts`
  - minimal type-only fixes in consumers, only where typecheck forces them
- **Covers**: AC-10 (schema), AC-44, AC-45, plus infra for every other AC
- **Required skills**: `zod`, `typescript-expert`
- **Depends on**: none
- **Can run in parallel with**: Step 2 (disjoint files)
- **What to do**:
  - **`knowledge.ts`:**
    - `ApiProvider = z.enum(['openai','anthropic','openrouter'])`.
    - `Provider = z.enum([...ApiProvider.options, 'local'])`.
    - `LOCAL_MODEL_ALIASES = ['opus','sonnet','haiku'] as const`, `LocalModelAlias`, `LOCAL_MODEL_LABELS`.
    - `LocalUnavailableReason = z.enum(['cli_missing','token_missing'])`.
    - `LocalFailureReason = z.enum(['cli_missing','token_missing','auth_failed','rate_limited','timeout','invalid_output','cli_error'])`.
    - `Billing = z.enum(['api','subscription'])`.
    - An exported refinement helper, `refineAgentProviderModel`: when `provider==='local'`, `model` must be one of the aliases. Apply it to the agent shapes at lines ~253 and ~299 where create/update bodies derive from them.
    - Add `billing: Billing.default('api')` to the `EvalRun` contract.
  - **`platform.ts`:**
    - `FeatureModelChoice.provider` and `FeatureModelDef.defaultProvider` → `ApiProvider`.
    - `ConnTestProvider` adds `'local'`.
    - `ConnTestResult` adds `reason: LocalFailureReason.optional()`.
    - `SecretsStatus` adds `local: z.boolean()`.
    - New `LocalStatus { available, reason?: LocalUnavailableReason, cli_version?: string, token_configured }`.
    - New `SecretSaveRequest { provider: z.literal('local'), key: z.string().min(1) }`.
  - **`eval-ci.ts`:** `AgentManifest.provider` rejects `'local'` with the message `Local agents can't run in CI`, and its inferred type narrows to `ApiProvider`.
  - **`adapters.ts`:**
    - `ModelInfo.provider` → the `Provider` enum.
    - `LLMProvider.id` union adds `'local'`.
    - `CompletionResult`/`StructuredResult` `tokensIn/Out: number | null`.
    - `SecretKey` adds `'LOCAL_CLAUDE_OAUTH_TOKEN'`.
  - **`trace.ts`:**
    - `RunStats.tokens_in/out` become nullable, and gain `billing: Billing.default('api')`, `queued_ms: z.number().int().nullish()` and `failure_reason: LocalFailureReason.nullish()`.
    - `RunSummary` gains `billing: Billing.default('api')`, `failure_reason: LocalFailureReason.nullish()` and `queued_for_local: z.boolean().default(false)`.
  - **reviewer-core `run.ts`:** `ReviewOutcome.tokensIn/Out: number | null`, type only.
  - **Client copy:** make each touched client file byte-identical to its server counterpart. If that breaks client typecheck outside this feature's scope, apply only the deltas and note it for `engineering-insights`.
  - **Test:** unit test for the alias refinement, the feature-model rejection, `AgentManifest` rejecting `local` (with its message), and the `RunSummary`/`EvalRun` billing default.
  - **Checkpoint:** `cd server && pnpm typecheck`, `cd client && pnpm typecheck`, `cd reviewer-core && npm run typecheck`.
- **Acceptance criteria**: the contracts reject `local` for feature models and manifests and reject non-alias models for `local` agents. Old payloads still parse, with `billing` defaulting to `api`. All three packages typecheck.

### Step 2 — DB migration: billing and failure reason
- **Domain**: backend
- **Module(s)**: `server/src/db/`
- **Layer**: infrastructure
- **Files likely touched**: `server/src/db/schema/runs.ts`, `server/src/db/schema/eval.ts`, generated `server/src/db/migrations/0016_*.sql` + `meta/*`
- **Covers**: AC-40, AC-43, AC-47 (storage), AC-27 (storage), AC-35 (billing storage)
- **Required skills**: `drizzle-orm-patterns`, `postgresql-table-design`
- **Depends on**: none
- **Can run in parallel with**: Step 1
- **What to do**:
  - `agent_runs`: add `failure_reason text` (nullable) with a CHECK limiting it to the seven reasons, and `billing text not null default 'api'` with `CHECK (billing in ('api','subscription'))`.
  - `eval_runs`: add the same `billing` column.
  - Run `pnpm db:generate`. Never hand-edit the SQL.
  - Run `pnpm db:migrate` locally to confirm the migration applies.
- **Acceptance criteria**: existing rows read `billing='api'`; the migration applies cleanly.

### Step 3 — Local provider adapter (CLI runner, gate, probe, classifier)
- **Domain**: backend
- **Module(s)**: `server/src/adapters/llm/local/` (new)
- **Layer**: infrastructure
- **Files likely touched**:
  - `server/src/adapters/llm/local/{cli-runner.ts,slot-gate.ts,availability.ts,envelope.ts,errors.ts,local-provider.ts,index.ts}`
  - `__fixtures__/*.json` (recorded envelopes) and `__fixtures__/stub-claude.mjs`
  - `*.test.ts` alongside
- **Covers**: AC-1–6 (probe and models), AC-16/17 (via `complete`), AC-20–24, AC-27–33, AC-36, AC-38, AC-39, AC-41, AC-46, NFR-1–4, NFR-7, NFR-9, NFR-10
- **Required skills**: `onion-architecture`, `security`, `typescript-expert`, `zod`
- **Depends on**: Step 1
- **Can run in parallel with**: Steps 4 and 5
- **What to do**:
  - **`cli-runner.ts`:**
    - Injectable `spawn` (default `node:child_process`).
    - Builds the args: `-p --model <alias> --tools "" --disallowedTools "mcp__*" --strict-mcp-config --no-session-persistence --disable-slash-commands --system-prompt <sys> --output-format json [--json-schema <schema>]`. The prompt goes on stdin; refuse prompts above 10 MB with `cli_error`.
    - Never use `--bare`. The token is never placed in the args.
    - Child env is an **allowlist**: `PATH`, temp `HOME`, temp `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, `DISABLE_AUTOUPDATER=1`, `DISABLE_UPDATES=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Nothing else is inherited, so no `ANTHROPIC_*` and no Bedrock/Vertex/Foundry flags.
    - The working directory is a fresh `mkdtemp` under `os.tmpdir()`. Assert it is not under `config.cloneDir`, and remove it after the call.
    - 300 s timeout from spawn start. `AbortSignal` support. Kill = SIGTERM, then SIGKILL after 2 s.
    - Keeps a registry of live children, and `killAll()` terminates them.
    - Collects stdout and stderr and returns `{exitCode, signal, stdout, stderr, durationMs}`.
  - **`slot-gate.ts`:**
    - FIFO semaphore, max 2.
    - `acquire({runId, signal, onQueued}) → {release, queuedMs}`; aborting while waiting removes the entry without spawning.
    - `isQueued(runId)`.
    - Uses an injectable clock.
  - **`availability.ts`:** `probe({cliPath, exec, getToken})`.
    - Runs `claude --version` with a 2 s timeout and matches `/^(\d+\.\d+\.\d+) \(Claude Code\)/`. A miss means `cli_missing`.
    - The token is read **only** through the injected `getToken` (DevDigest secrets), so a host login never counts.
    - Returns `LocalStatus` and never makes a model call. Cached ≤10 s.
  - **`envelope.ts`:**
    - Parses the result envelope (`type`, `subtype`, `is_error`, `result`, `structured_output`, `usage`, `errors`, `api_error_status`).
    - `classifyFailure()` maps to `auth_failed` (markers listed in the research, 401 or `authentication_failed`), `rate_limited` (session/weekly limit text, 429, `rate_limit`; extract the `resets …` text), timeout/kill → `timeout`, anything else → `cli_error`.
    - `redact(text, token)` and truncate to 500 characters.
    - Usage: read `input_tokens`/`output_tokens`; missing → `null`.
  - **`errors.ts`:** `LocalProviderError(reason, message, {queuedMs?})`, extending the existing `ExternalServiceError`. The `auth_failed` message tells the user to create a new token with `claude setup-token` and save it in Settings. The `rate_limited` message includes the reset text when the CLI reports one.
  - **`local-provider.ts` — `LocalClaudeProvider implements LLMProvider` (`id: 'local'`), built with `{runner, gate, probe, getToken, logger, ctx?}`:**
    - `listModels()` returns the 3 aliases and labels without spawning.
    - `completeStructured()`:
      - Probe first. If unavailable, throw the reason with **zero spawns** (AC-25).
      - Acquire a slot (`onQueued` fires when it has to wait).
      - Loop `maxRetries+1` times (default 2 reprompts): run the CLI with `--json-schema` (`toJsonSchema` from `platform/structured.ts`), then `parseWithRepair` on `structured_output ?? result`. On a parse failure, append the reprompt and retry. An `error_max_structured_output_retries` subtype also counts as an invalid attempt.
      - When attempts run out, throw `invalid_output`.
      - Any classified CLI failure throws immediately, with no retry (AC-29).
      - Success returns `costUsd: 0`, nullable tokens and `attempts`.
      - Always release the slot.
      - Logs exactly one NFR-10 line per call: `runId`, alias, `queuedMs`, `durationMs`, outcome. No prompt, output or token.
    - `complete()` makes a single call without a schema (used by the connection test).
    - `embed()` throws `embeddings not supported by Local`.
  - **Tests (hermetic, NFR-9):**
    - Unit tests with a fake spawn and the recorded fixtures (success with and without usage, auth, session limit, 429, max-structured-retries, bad-flag stderr, long stderr), plus a sentinel token echoed to stderr.
    - Fake timers for the timeout, cancel, queue-time and kill-grace cases.
    - One real-spawn test against `stub-claude.mjs` (a node script, not the real CLI). It dumps its env, working directory and args, and the test asserts:
      - no other DevDigest secrets are present;
      - the token is in the env only;
      - the working directory is not under the clone dir;
      - no session files exist under the temp `HOME`.
  - **Verification task (manual; the result is recorded, not tested):** with a real CLI 2.1.296 and a throwaway token, the implementor confirms:
    - the exact JSON envelope and `usage` key names;
    - the shape of a usage-limit result;
    - whether `--setting-sources ""` is accepted (add it if so);
    - whether `--max-turns` is needed (use 3 if structured output takes an internal turn).

    Then update the fixtures to the recorded shapes and note the findings for `engineering-insights`. If no real CLI is available, keep the research-derived fixtures and flag the item as unverified in the hand-back.
- **Acceptance criteria**: the covered ACs, stated in adapter terms. Each AC-27 reason is produced by exactly one fixture case, the token never appears in args, logs or stored text, and there is at most 2 concurrent spawns.

### Step 4 — Client data layer and subscription/queued surfaces
- **Domain**: frontend
- **Module(s)**: `client/src/lib/`, `client/src/components/run-cost-badge/`, `client/src/app/repos/[repoId]/pulls/[number]/_components/{RunHistory,RunTraceDrawer}/`, `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/`
- **Files likely touched**:
  - new `client/src/lib/hooks/local.ts` (`useLocalStatus` with query key `['local-status']` → `GET /settings/local-status`; `useSaveLocalToken` → `POST /settings/secrets`, which invalidates `local-status` and `secrets-status`)
  - `client/src/lib/format.ts` + `format.test.ts`
  - `RunCostBadge.tsx`; `RunHistory.tsx` + test; `RunTraceDrawer/_components/TraceBody/TraceBody.tsx` + `RunTraceDrawer.test.tsx`; agent `StatsTab.tsx` + test
  - the message JSON these components already use (`client/messages/en/runs.json` / `prReview.json` / `agents.json`, StatsTab keys only)
- **Covers**: AC-37 (client text), AC-42, AC-47 (trace display), NFR-6 (badge text, not only colour)
- **Required skills**: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`
- **Depends on**: Step 1
- **Can run in parallel with**: Steps 3 and 5
- **What to do**:
  - Add `formatRunCost(cost_usd, billing)`, which returns "Subscription" when `billing==='subscription'`.
  - Use it in the run cost badge, PR run history, the run trace and the agent Stats run history.
  - RunHistory shows "Queued: waiting for a Local slot" when `queued_for_local`.
  - TraceBody shows billing, `queued_ms` and `failure_reason` when present.
  - All strings go through next-intl.
- **Acceptance criteria**: "Subscription" appears on all three cost surfaces (and the agent history); queued text renders from the fixture; the hooks call the new endpoints.

### Step 5 — Docker image CLI and mcp-server test
- **Domain**: backend
- **Module(s)**: `server/Dockerfile`, `mcp-server/src/tools/`
- **Files likely touched**: `server/Dockerfile`, `mcp-server/src/tools/run-agent-on-pr.test.ts`
- **Covers**: AC-34; the Docker assumption (spec Assumptions)
- **Required skills**: `security`
- **Depends on**: none (the test matches the Step 7 error format `"<reason>: <message>"`)
- **Can run in parallel with**: Steps 3 and 4
- **What to do**:
  - Dockerfile: `RUN npm install -g @anthropic-ai/claude-code@2.1.296`. Do not omit optional deps; the native binary arrives through them. If 2.1.296 fails to install, use 2.1.290.
  - Dockerfile: add `ENV DISABLE_AUTOUPDATER=1`.
  - mcp test (npm): a stubbed API returns a failed run with `error: "rate_limited: You've hit your session limit · resets 3:45pm"`. Assert `isError: true` and that the text contains `rate_limited`.
- **Acceptance criteria**: the image builds with `claude --version` available (manual `docker build -f server/Dockerfile .`); the mcp test passes.

### Step 6 — Server wiring: container, settings, agents, shutdown
- **Domain**: backend
- **Module(s)**: `server/src/platform/`, `server/src/app.ts`, `server/src/modules/{settings,agents}/`, `server/src/adapters/mocks.ts`
- **Layer**: composition-root + application + presentation
- **Files likely touched**:
  - `server/src/platform/container.ts`, `server/src/app.ts`
  - `server/src/modules/settings/{constants,service,routes}.ts`
  - `server/src/modules/agents/{routes,service}.ts`
  - `server/src/adapters/mocks.ts` (local overrides helper)
  - new tests `server/src/modules/settings/local.it.test.ts`, `server/src/modules/agents/local-agent.it.test.ts`, `server/src/platform/container.local.test.ts`
- **Covers**: AC-1–6 (endpoints), AC-9, AC-10, AC-13 (API never returns the value), AC-15, AC-16, AC-17, AC-44, NFR-1, NFR-3 (responses), NFR-5, NFR-7 (wiring)
- **Required skills**: `onion-architecture`, `fastify-best-practices`, `zod`, `security`
- **Depends on**: Steps 1 and 3
- **Can run in parallel with**: Steps 8 and 9 (disjoint packages)
- **What to do**:
  - **Container:**
    - Add a `LocalSlotGate` singleton, the runner, `localStatus()`, `killLocalProcesses()`.
    - Add `llmFor(provider: Provider, ctx?: LocalRunContext)`: API ids go to the existing `llm()`; `local` probes availability, throws `LocalProviderError` with the reason if unavailable, and otherwise returns a run-bound `LocalClaudeProvider` whose `getToken` reads `LOCAL_CLAUDE_OAUTH_TOKEN` per call.
    - Keep `llm()` typed `ApiProvider`.
    - Add `ContainerOverrides.local?: { spawn?, exec?, cliPath?, clock? }` for tests.
  - **`app.ts`:** add an `onClose` hook that calls `container.killLocalProcesses()`.
  - **Settings:**
    - `SECRET_KEY_BY_PROVIDER.local = 'LOCAL_CLAUDE_OAUTH_TOKEN'`.
    - `GET /settings/local-status` → `LocalStatus`.
    - `POST /settings/secrets` (`SecretSaveRequest`, `rateLimit` 20/min) saves the token, calls `invalidateSecretCaches`, returns `204` or the status, and makes no model call.
    - `testConnection('local')`:
      - If unavailable, return `{ok:false, reason, message}`.
      - Otherwise make one minimal `complete()` call through the gate and return `ok:true` with a message naming the CLI version.
      - Map `LocalProviderError` to `{ok:false, reason, message}` (redacted). It never throws and never returns 5xx.
  - **Agents:**
    - Route params and bodies use `Provider` plus the alias refinement, so a non-alias model returns 422 and nothing is stored.
    - `listModels('local')` uses `llmFor` and degrades to `[]`.
  - **Feature models:** rejection is automatic through `ApiProvider`. Add a test that `PUT /settings` returns 422 and the settings are unchanged.
  - **NFR-5 test:** build the app with the rate-limit plugin enabled. It is skipped when `nodeEnv==='test'` (`app.ts:95`), so set a non-test env or register the plugin in that test. Assert the 21st call returns 429 on both `test-connection` and `secrets`.
  - **Checkpoint:** `cd server && pnpm typecheck` and `scripts/verify.sh server <touched files>`.
- **Acceptance criteria**: the covered ACs over HTTP. A sentinel token never appears in any response body.

### Step 7 — Server wiring: review runs and evals through Local
- **Domain**: backend
- **Module(s)**: `server/src/modules/{reviews,evals}/`, `server/src/platform/sse.ts`
- **Layer**: application + infrastructure (repositories)
- **Files likely touched**:
  - `server/src/platform/sse.ts`
  - `server/src/modules/reviews/{run-executor.ts,service.ts,repository.ts,repository/run.repo.ts,routes.ts}`
  - `server/src/modules/evals/{runner.ts,service.ts,repository.ts}`
  - new tests `server/src/modules/reviews/local-run.it.test.ts`, `server/src/modules/evals/local-eval.it.test.ts`, `server/src/platform/sse.test.ts` (cancel hook)
- **Covers**: AC-19, AC-23–33, AC-35–41, AC-43, AC-47, NFR-2, NFR-3 (DB/trace), NFR-8, NFR-10 (run id passed)
- **Required skills**: `onion-architecture`, `drizzle-orm-patterns`, `fastify-best-practices`, `security`
- **Depends on**: Steps 2 and 6
- **Can run in parallel with**: none (last batch)
- **What to do**:
  - **`sse.ts`:** `onCancel(runId, cb)`; `cancel()` invokes the registered callbacks; `complete()` clears them.
  - **Run executor:**
    - Create a per-run `AbortController` wired to `runBus.onCancel`.
    - Resolve the provider with `container.llmFor(agent.provider, { runId, signal, onQueued: () => runLog.info('Queued: waiting for a Local slot'), logger })`.
    - On failure:
      - `cancelled = err instanceof RunCancelledError || runBus.isCancelled(runId)`.
      - For a `LocalProviderError`, persist `failure_reason` and `error = "<reason>: <message>"`, with `costUsd: null` and tokens null.
      - Never insert a review row (AC-33).
    - On success: cost 0 and nullable tokens.
    - Trace stats carry `billing`, `queued_ms` and `failure_reason`.
  - **Billing:** set at agent_runs **insert** from `agent.provider` (`local` → `subscription`), so failed runs keep the marker.
  - **Run reads:** `listRunsForPull` and active-runs map `billing`/`failure_reason`. The service overlays `queued_for_local` from `container.localGate.isQueued(run_id)`.
  - **"Run all":** per-agent isolation already exists (`executeRuns`); add the AC-26 test only.
  - **Evals:** the runner uses `llmFor(config.provider, { runId: <eval run/case id>, logger })` with no signal. The eval service and repository persist `billing` and cost 0.
  - **Tests (DB-backed `*.it.test.ts`, stub spawn via `ContainerOverrides.local`, fake timers):**
    - one case per AC-27 reason;
    - 5 concurrent runs → max 2 spawns;
    - queued indication on `GET /pulls/:id/runs`;
    - cancel running (kill ≤5 s) and cancel queued (spawn count unchanged);
    - 400 s queued + 10 s call → success;
    - grounding drops a bad citation;
    - mock OpenAI/Anthropic/OpenRouter call counters = 0;
    - start responses are 2xx on every failure;
    - a sentinel token absent from the `agent_runs` row, the trace JSON and the logs.
- **Acceptance criteria**: the covered ACs end to end on the stubbed CLI.

### Step 8 — Client Settings: "Local (Claude Code)" row
- **Domain**: frontend
- **Module(s)**: `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/`
- **Files likely touched**: `SettingsApiKeys.tsx`, new `_components/LocalProviderRow/{LocalProviderRow.tsx,LocalProviderRow.test.tsx,index.ts,styles.ts}`, `client/messages/en/settings.json`
- **Covers**: AC-13, AC-14, AC-16 (UI), AC-17 (UI), AC-18, NFR-6
- **Required skills**: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `security`
- **Depends on**: Steps 1 and 4 (hooks)
- **Can run in parallel with**: Steps 6 and 9
- **What to do**:
  - Labelled write-only password field that is empty after save or reload, with a "Save token" button using `useSaveLocalToken`.
  - Status line with `role="status"`, e.g. `CLI 2.1.311 · token configured · available`, or the unavailable reason text.
  - "Test connection" uses the existing test-connection mutation with `provider:'local'`. It is disabled with `aria-busy` while pending, stays mounted so focus stays on it, and shows the result message (plus reason) as plain text.
- **Acceptance criteria**: RTL queries by role and name cover every point above.

### Step 9 — Client agents: provider choice, warning, badge
- **Domain**: frontend
- **Module(s)**: `client/src/components/provider-select/` (new), `client/src/app/agents/**`
- **Files likely touched**:
  - new `client/src/components/provider-select/{ProviderSelect.tsx,ProviderSelect.test.tsx,index.ts}`
  - `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/{ConfigTab.tsx,constants.ts}` + a new `ConfigTab.test.tsx` if absent
  - `client/src/app/agents/_components/AgentsListView/_components/CreateAgentModal/{CreateAgentModal.tsx,constants.ts}`
  - `client/src/app/agents/_components/AgentCard/{AgentCard.tsx,AgentCard.test.tsx}`
  - `client/messages/en/agents.json`
- **Covers**: AC-7, AC-8, AC-11, AC-12, NFR-6
- **Required skills**: `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`
- **Depends on**: Steps 1 and 4 (hooks)
- **Can run in parallel with**: Steps 6 and 8
- **What to do**:
  - **ProviderSelect:** a native `<select>` styled like `SelectInput` that supports `disabled` options.
  - **Provider options:** add "Local (Claude Code)" to the editor and create dialog. While unavailable, it is disabled with label text "Unavailable: Claude Code CLI not found" or "Unavailable: token not configured", **unless** the agent's current provider is `local`.
  - **ConfigTab:** when the provider is `local` and Local is unavailable, show a text warning naming the reason. Keep the stored model: the existing "unshift current model" logic stays, with no auto-reset when the list is `[]`.
  - **AgentCard:** show a "Local unavailable" text badge.
- **Acceptance criteria**: client tests with status fixtures for both reasons cover each AC.

## Coverage

| Spec ID | Step(s) | Planned test (package · file or name · unit/it/e2e) |
|---|---|---|
| AC-1 | 3, 6 | server · `adapters/llm/local/availability.test.ts` (4 combinations) · unit; `modules/settings/local.it.test.ts` · it |
| AC-2 | 3, 6 | server · `availability.test.ts` · unit; `settings/local.it.test.ts` · it |
| AC-3 | 3, 6 | server · `availability.test.ts` · unit; `settings/local.it.test.ts` · it |
| AC-4 | 3 | server · `availability.test.ts` (logged-in stub, env `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY` set, no DevDigest token → `token_missing`) · unit |
| AC-5 | 3, 6 | server · `local-provider.test.ts` · unit; `agents/local-agent.it.test.ts` (`GET /providers/local/models` → 3) · it |
| AC-6 | 6 | server · `agents/local-agent.it.test.ts` (→ `[]`) · it |
| AC-7 | 9 | client · `ProviderSelect.test.tsx`, `ConfigTab.test.tsx` · unit |
| AC-8 | 9 | client · `ConfigTab.test.tsx` (disabled option with reason text) · unit |
| AC-9 | 6 | server · `agents/local-agent.it.test.ts` (PUT round-trip) · it |
| AC-10 | 1, 6 | server · `agents/local-contracts.test.ts` · unit; `agents/local-agent.it.test.ts` (422, unchanged) · it |
| AC-11 | 9 | client · `ConfigTab.test.tsx` (warning + model still `opus`) · unit |
| AC-12 | 9 | client · `AgentCard.test.tsx` · unit |
| AC-13 | 6, 8 | client · `LocalProviderRow.test.tsx` · unit; server · `settings/local.it.test.ts` (no value in responses) · it |
| AC-14 | 8 | client · `LocalProviderRow.test.tsx` · unit |
| AC-15 | 6 | server · `settings/local.it.test.ts` (save → next stub call receives the new token) · it |
| AC-16 | 6, 8 | server · `settings/local.it.test.ts` · it; client · `LocalProviderRow.test.tsx` · unit |
| AC-17 | 3, 6, 8 | server · `settings/local.it.test.ts` (auth stub → `ok:false, auth_failed`, 200) · it |
| AC-18 | 8 | client · `LocalProviderRow.test.tsx` · unit |
| AC-19 | 3, 7 | server · `reviews/local-run.it.test.ts` (persisted review; bad citation dropped) · it |
| AC-20 | 3 | server · `cli-runner.test.ts` (args) + stub-binary test · unit |
| AC-21 | 3 | server · `cli-runner.test.ts` stub-binary (working directory outside the clone dir; clone has CLAUDE.md/.claude) · unit |
| AC-22 | 3 | server · `cli-runner.test.ts` stub-binary (no session files in temp HOME) · unit |
| AC-23 | 3, 7 | server · `local-provider.test.ts` (invalid ×2 → `attempts:3`) · unit; `local-run.it.test.ts` · it |
| AC-24 | 3, 7 | server · `local-provider.test.ts` · unit; `local-run.it.test.ts` · it |
| AC-25 | 3, 6, 7 | server · `local-run.it.test.ts` (no token → failed `token_missing`, 0 spawns) · it |
| AC-26 | 7 | server · `local-run.it.test.ts` (Run all: Local + mock OpenRouter) · it |
| AC-27 | 3, 7 | server · `envelope.test.ts` table-driven · unit; `local-run.it.test.ts` per reason · it |
| AC-28 | 3 | server · `envelope.test.ts` (message contains `claude setup-token`) · unit |
| AC-29 | 3 | server · `local-provider.test.ts` (1 spawn, reset text in message) · unit |
| AC-30 | 3 | server · `cli-runner.test.ts` fake timers · unit |
| AC-31 | 3, 7 | server · `cli-runner.test.ts` · unit; `local-run.it.test.ts` (cancel → kill ≤5 s, cancelled) · it |
| AC-32 | 3 | server · `envelope.test.ts` (≤500 chars) · unit |
| AC-33 | 7 | server · `local-run.it.test.ts` (no review row per failure case) · it |
| AC-34 | 5 | mcp-server · `tools/run-agent-on-pr.test.ts` · unit |
| AC-35 | 7 | server · `evals/local-eval.it.test.ts` (billing `subscription`) · it |
| AC-36 | 3, 7 | server · `slot-gate.test.ts` · unit; `local-run.it.test.ts` (5 runs → max 2) · it |
| AC-37 | 3, 4, 7 | server · `local-run.it.test.ts` (`queued_for_local` + log event) · it; client · `RunHistory.test.tsx` · unit |
| AC-38 | 3, 7 | server · `slot-gate.test.ts` · unit; `local-run.it.test.ts` · it |
| AC-39 | 3 | server · `local-provider.test.ts` fake clock (queued 400 s + 10 s call) · unit |
| AC-40 | 7 | server · `local-run.it.test.ts` (row + trace) · it |
| AC-41 | 3, 7 | server · `envelope.test.ts` · unit; `local-run.it.test.ts` (null when absent) · it |
| AC-42 | 4 | client · `format.test.ts`, `RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`, run-cost-badge test · unit |
| AC-43 | 7 | server · `local-run.it.test.ts` (`cost_usd: null`, billing `subscription`) · it |
| AC-44 | 1, 6 | server · `agents/local-contracts.test.ts` · unit; `settings/local.it.test.ts` (PUT → 422, unchanged) · it |
| AC-45 | 1 | server · `agents/local-contracts.test.ts` (manifest rejects with message) · unit |
| AC-46 | 3 | server · `local-provider.test.ts` · unit |
| AC-47 | 7, 4 | server · `local-run.it.test.ts` (trace fields) · it; client · `RunTraceDrawer.test.tsx` · unit |
| NFR-1 | 3, 6 | server · `availability.test.ts` (timing, 0 model calls) · unit; `settings/local.it.test.ts` · it |
| NFR-2 | 3, 7 | server · `local-run.it.test.ts` (mock API provider counters = 0; connection test = 1 spawn) · it |
| NFR-3 | 3, 6, 7 | server · `cli-runner.test.ts` sentinel (args/env/stderr redaction) · unit; `local-run.it.test.ts` (DB, trace, logs) · it; `settings/local.it.test.ts` (responses) · it |
| NFR-4 | 3 | server · `cli-runner.test.ts` stub-binary env dump · unit |
| NFR-5 | 6 | server · `settings/local.it.test.ts` (21st → 429, rate limiter enabled) · it |
| NFR-6 | 4, 8, 9 | client · `LocalProviderRow.test.tsx`, `ConfigTab.test.tsx`, `AgentCard.test.tsx` (role/name queries) · unit |
| NFR-7 | 3, 6 | server · `cli-runner.test.ts` (`killAll` ≤5 s) · unit; `platform/container.local.test.ts` (onClose kills) · unit |
| NFR-8 | 7 | server · `local-run.it.test.ts` (2xx start for every reason) · it |
| NFR-9 | 3–9 | all suites run without a `claude` binary; stub spawn/binary only |
| NFR-10 | 3 | server · `local-provider.test.ts` (one log line, no prompt/output/token) · unit |

## Execution guidance
Four batches, each with ≤4 concurrent implementors. File ownership never overlaps inside a batch, so no step needs `isolation: "worktree"`.

- **Batch 1 (parallel):** Step 1 (`vendor/shared` ×2, `reviewer-core/src/review/run.ts`) ∥ Step 2 (`server/src/db/**`). Disjoint. After merging, the session runs typecheck in server, client and reviewer-core, plus `pnpm db:migrate`.
- **Batch 2 (parallel):** Step 3 (`server/src/adapters/llm/local/**`, new) ∥ Step 4 (`client/src/lib/**`, run/cost components, `runs.json`/`prReview.json`, StatsTab only) ∥ Step 5 (`server/Dockerfile`, `mcp-server/src/tools/run-agent-on-pr.test.ts`). Disjoint. After the batch: `scripts/verify.sh server server/src/adapters/llm/local`, `scripts/verify.sh client`, and `cd mcp-server && npm test`.
- **Batch 3 (parallel):** Step 6 (server: container, app, settings, agents, mocks) ∥ Step 8 (`SettingsApiKeys/**`, `settings.json`) ∥ Step 9 (`components/provider-select/**`, agents ConfigTab, CreateAgentModal, AgentCard, `agents.json`).
  - Steps 8 and 9 only **read** `client/src/lib/hooks/local.ts`, which Step 4 owns. Neither may edit it. If a hook change is needed, report it back instead.
  - Step 4 already finished its edits to `agents.json` in Batch 2, so Step 9 owns that file now.
- **Batch 4 (sequential):** Step 7. It depends on Step 6's `container.llmFor` / `localGate` and on Step 2's columns.

## Definition of done
- **Commands per package** (never mix package managers):
  - `cd server && pnpm typecheck && pnpm test`
  - `cd client && pnpm typecheck && pnpm test`
  - `cd reviewer-core && npm run typecheck && npm test`
  - `cd mcp-server && npm test`
- **Migration:** `cd server && pnpm db:generate` (Step 2 only) and `pnpm db:migrate` applied.
- **Docker:** manual check `docker build -f server/Dockerfile .`, then `claude --version` inside the image.
- **Post-landing gates,** in the order `/implement-plan` defines:
  1. `scripts/verify.sh <pkg> --full`, once each for server, client and reviewer-core (mcp-server via `npm test` if `verify.sh` doesn't cover it).
  2. `plan-verifier` against the spec and this plan.
  3. `pr-self-review` before any PR.
  4. `doc-writer` for the new routes in `server/README.md` and the Settings row in `client/README.md`.
  5. `engineering-insights`: record the verified CLI invocation and envelope shapes (Step 3's verification task), the per-route rate limit being inert under `nodeEnv=test`, and the shared-copy sync outcome.
- **Spec housekeeping:** no spec file is modified by this plan; any status change is the user's call.
