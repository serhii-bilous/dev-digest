# Implementation plan: Project Context (remaining work after 92c06dd)

**Execution mode:** multi-agent (chosen by the user)
**Requirements source:** `specs/2026-10-03-project-context.md`. This plan only reads it and changes nothing under `*/specs/**`.
**Spec ID:** SPEC-2026-10-03-project-context
**Branch:** stay on `feat/LAB5-spec-driven-development`, which already holds 92c06dd. No new branch.

## Overview
Commit 92c06dd already delivered most of Project Context:
- the discovery and attachment API,
- run-time injection with budget, missing-doc handling and the trace,
- the reviewer-core framing rule and path-labelled blocks,
- the page, both Context tabs, the preview drawer, the trace drawer and the nav item.

What this plan adds:
- moves filesystem discovery behind a DI adapter (onion layering);
- fixes the AC-27 warning;
- fixes AC-20 and NFR-7 accessibility gaps in the picker and drawer, without editing the vendored UI kit;
- adds the missing tests in all three packages, next to the code they exercise;
- updates stale docs and INSIGHTS.

## Assumptions
- NFR-1 and NFR-2 are tested with generous wall-clock thresholds, at the spec's bounds (500 ms / 1 s). Measurement is in-process and hermetic. There is no p95 sampling harness.
- AC-58's "resolves outside the repo clone" is met in two places. At attach time the path format is validated. At read time, containment is enforced: realpath containment in the fs adapter, and `git show` blob reads at run time, which never follow symlinks. No repo is known when you attach.

## Documented deviations from the spec (agreed with the user; the spec text is not edited)
1. **AC-36, base branch instead of base SHA.** Run-time reads go to `pull.base`, falling back to `origin/<base>`. The review diff in `server/src/modules/reviews/diff-loader.ts` uses the same ref. `pull_requests` has no base-SHA column. The PR still cannot rewrite the documents. Step 2 adds a test that no read ever targets the head SHA or a `pr-<n>` ref.
2. **Agent-context read contract stays lean.**
   - What ships: `GET /agents/:id/context` returns `{ own: string[], inherited: {path, skill_id, skill_name}[] }`.
   - What the spec's Contracts section lists: `found`/`tokens` per row, `effective_tokens`, `budget_tokens`, `skipped_by_budget`.
   - The client already derives those from the repo list (`ContextList.budget_tokens` plus `client/src/components/project-context/helpers.ts`).
   - Reason: attachments carry no repo id, so the server cannot resolve `found` for this endpoint.
3. **Accessibility fixes are local** to `client/src/components/project-context/`. The vendored `Checkbox` and `Drawer` are not touched.

## Accepted recommendations
- Rec 1, lean contract → deviation 2. No step.
- Rec 2, base branch → deviation 1, tested in Step 2.
- Rec 3, local accessibility → Step 5.
- Rec 4, AC-27 shows both warnings → Step 5.
- Rec 6, docs plus stale INSIGHTS, stale glob comment and stale test → Step 1 (comment and test) and Step 7 (docs and INSIGHTS).
- Rec 7, fs behind an adapter port → Step 1.

## Module impact map
- **`server/src/adapters/docstore/` (new)** — `DocStore` port plus the `FsDocStore` adapter. The port follows the in-adapter port pattern of `adapters/tokenizer/index.ts` and `adapters/depgraph/index.ts`. No docs or specs exist for this module.
- **`server/src/platform/container.ts`, `server/src/adapters/mocks.ts`** — the `docStore` getter and override, plus a `MockDocStore`.
- **`server/src/modules/context/`** — the service uses `container.docStore`, and `discovery.ts` is removed. No module docs exist. The root `INSIGHTS.md` 2026-10-03 entry is stale.
- **`server/src/platform/project-context.ts`** — receives the discovery constants and gets its stale glob comment fixed.
- **`server/test/`** — new and updated tests.
- **`reviewer-core/test/prompt.test.ts`** — new Project Context assertions. No source changes. Checked `reviewer-core/CLAUDE.md`.
- **`client/src/components/project-context/`** — the accessible checkbox, the focus trap, the AC-27 fix, and tests.
- **`client/src/app/repos/[repoId]/context/`** — the page body is extracted into `_components/ProjectContextView/` plus a test, following the client convention that pages stay thin (`client/CLAUDE.md`).
- **`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/`** — tests only.
- **`client/src/app/agents/[id]/…`, `client/src/app/skills/[id]/…`** — tab-order and Context-tab tests.
- **`client/src/components/app-shell/`** — nav test.
- **Docs** — `server/README.md`, `server/.env.example`, root `INSIGHTS.md` (Step 7).

## Architecture notes (backend)
- **Infrastructure:** `server/src/adapters/docstore/index.ts` exports the port and its fs adapter.

  ```ts
  interface DocStore {
    exists(cloneDir: string): Promise<boolean>;
    discover(cloneDir: string, roots: readonly string[], glob: string): Promise<{ files: DiscoveredFile[]; truncated: boolean }>;
    read(cloneDir: string, repoPath: string): Promise<string>;
  }
  ```

  `FsDocStore` takes the current `discovery.ts` logic unchanged: symlink skip, excluded dirs, README exclusion, sorted walk, `MAX_CONTEXT_DOCS` truncation, and the realpath containment check on read.
- **Domain rules (platform):** `EXCLUDED_DIRS`, `EXCLUDED_FILE_NAMES` and `MAX_CONTEXT_DOCS` move from `modules/context/constants.ts` to `platform/project-context.ts`. The adapter imports pure rules from platform, as `discovery.ts` already does today. An adapter must never import from `modules/**`. `NOT_CLONED_CODE` stays in `modules/context/constants.ts`.
- **Composition root:** `Container.docStore` is a lazy getter, and `ContainerOverrides.docStore` lets tests swap it.
- **Application:** `ContextService` uses only `container.docStore`. No `node:fs` import may remain under `server/src/modules/context/`.
- **Run-executor:** unchanged. It reads through `GitClient.readFileAtRef` at the base branch.

## Steps

### Step 1: DocStore port and fs adapter, service rewiring, discovery tests
- **Domain**: backend
- **Module(s)**: `server/src/adapters/docstore/`, `server/src/modules/context/`, `server/src/platform/`
- **Layer**: infrastructure + application + composition-root
- **Files likely touched**:
  - new: `server/src/adapters/docstore/index.ts`
  - edit: `server/src/platform/container.ts`, `server/src/adapters/mocks.ts` (add `MockDocStore`), `server/src/modules/context/service.ts`, `server/src/modules/context/constants.ts`, `server/src/platform/project-context.ts`
  - delete: `server/src/modules/context/discovery.ts`
  - tests: `server/test/project-context.test.ts` (this step owns the file), new `server/test/docstore-fs.test.ts`, new `server/test/context-service.test.ts`
- **Covers**: infra, AC-1, AC-2, AC-3, AC-4, AC-12 (service), AC-58 (service), NFR-2, NFR-5
- **Required skills**: onion-architecture, typescript-expert, security
- **Depends on**: none
- **Can run in parallel with**: Steps 2, 5 and 6. Its files don't overlap theirs. Step 2 must not edit `project-context.test.ts`, `mocks.ts` or `container.ts`.
- **What to do**:
  1. Create the port and `FsDocStore` as described in Architecture notes, moving the code from `discovery.ts`.
  2. Wire `docStore` into `Container` and `ContainerOverrides`.
  3. In `ContextService`, replace `access(cloneDir)` with `docStore.exists`, `discoverMarkdown` with `docStore.discover`, and `readInsideClone` with `docStore.read`. Behaviour must stay byte-identical: the same 409 `repo_not_cloned` body and the same 404s.
  4. Add a `MockDocStore` to `mocks.ts`: an in-memory `{ [cloneDir]: { [path]: content } }` with `exists` and `discover` honouring the glob and exclusions via the platform rules.
  5. Fix the `globToRegExp` doc comment to cite the current default `**/specs/**/*.md`.
  6. In `server/test/project-context.test.ts`:
     - Move the `discoverMarkdown` describe into `docstore-fs.test.ts`.
     - Change the first rules test to assert the default glob from `DEFAULT_CONTEXT_GLOB`, keeping one explicit `{specs,docs,insights}` case.
     - **Keep** the three run-time executor tests unchanged. They cover AC-53/54.
  7. `docstore-fs.test.ts` uses a tmp dir and covers:
     - default-glob path set (AC-1), including case-insensitive README exclusion;
     - `.devdigest/specs/a.md` found (AC-2);
     - `node_modules/x/specs/a.md`, `src/vendor/specs/b.md` and `.git/specs/c.md` all absent (AC-3);
     - a symlinked `.md` pointing outside the dir is excluded, and `read('../x.md')` or a symlink escape rejects (NFR-5);
     - truncation: lower the cap via an injected fixture or generate `MAX_CONTEXT_DOCS + 1` files, then expect `truncated: true`;
     - **NFR-2**: generate 500 `specs/*.md` files and run `ContextService.list` with the real `FsDocStore` + `TiktokenTokenizer` and stubbed `reposRepo`/`agentsRepo`/`skillsRepo` (no DB). Assert the warm call (token cache primed) finishes in under 1,000 ms, and log the cold time.
  8. `context-service.test.ts` uses `MockDocStore` and stub repos and covers:
     - list shape, `type` (AC-4), and `used_by` agents counting own plus inherited, skills counting direct only (feeds AC-7);
     - a non-existent clone throws an `AppError` with code `repo_not_cloned` and status 409 (AC-12);
     - detail for an undiscovered path → `NotFoundError`;
     - `setAgentContext`/`setSkillContext` with `/abs.md`, `a/../b.md`, `a.txt`, `a\\b.md` each throw a 400 `validation_error`, and the repo `setContextPaths` is never called (AC-58);
     - duplicate input paths are deduped.
- **Acceptance criteria**: no `node:fs` import under `server/src/modules/context/`; `pnpm typecheck` clean; the existing executor tests still pass; the tests above pass.

### Step 2: Run-time project-context tests (executor)
- **Domain**: backend
- **Module(s)**: `server/test/`
- **Layer**: application (tests only, no source changes)
- **Files likely touched**: new `server/test/project-context-run.test.ts` (with its own local `setup()` modelled on the one in `project-context.test.ts`; do not import from or edit that file)
- **Covers**: AC-33, AC-34, AC-35 (executor side), AC-36, AC-37, AC-38, AC-41, AC-42 (executor side), AC-43, AC-44, AC-46, AC-51, NFR-1, NFR-3, NFR-8, NFR-9, NFR-10
- **Required skills**: typescript-expert
- **Depends on**: none. It uses a cast `Container` object, not `container.ts`.
- **Can run in parallel with**: Steps 1, 5 and 6
- **What to do**: drive `ReviewRunExecutor.executeRuns` with a stubbed LLM, a `MockGitClient` whose `readFileAtRef` is a `vi.fn`, and a stubbed `agentsRepo.enabledSkillsForPrompt`. Cases:
  - **AC-33/34:** own `[a,b]`, skill1 `[b,c]`, skill2 `[d,a]` → `specs_read` order is a, b, c, d, each with the right `source` and `skill_name`.
  - **AC-35:** assert that the executor sources skills only from `enabledSkillsForPrompt`, not `linkedSkills`. The stub's `linkedSkills` returns a disabled skill with path `x.md`, and `x.md` must be absent. The real enabled filter is covered in Step 3.
  - **AC-36 (deviation 1):** every `readFileAtRef` call's ref is in `{pull.base, 'origin/'+pull.base}`, never `pull.headSha` or `pr-<n>`. Also cover a PR whose `files` fixture differs by ref: the base content is injected.
  - **AC-37:** a missing path gives `status: 'missing'`, a log line naming it, and no block for it.
  - **AC-38 / NFR-8:** `readFileAtRef` throws `fatal: not a git repository` → the run completes (`completeAgentRun` status `done`), `prompt_assembly.specs` is null, the user prompt has no `## Project context`, and a log line starts with `project context: skipped —`.
  - **AC-41:** config `budgetTokens: 300`, docs of 200/150/50 tokens (stub tokenizer) → included / skipped_budget / skipped_budget.
  - **AC-42 (executor):** an agent with `contextPaths: []` and no skill paths gives a user prompt identical to one with `contextPaths` undefined, and `readFileAtRef` is never called.
  - **AC-43:** with `repoIntel: false`, the section is present.
  - **AC-44 / NFR-3:** the LLM call count is 1 both with and without attachments.
  - **AC-46:** the stubbed LLM throws → `saveRunTrace` still receives `specs_read` with the resolved entries, and the run is `failed` (the model error, not the context, failed it).
  - **AC-51 / NFR-10:** the exact log line `project context: 2 doc(s) (+~N tokens), 1 missing, 0 skipped (budget)` is present in the persisted `trace.log`.
  - **NFR-1:** 20 fixture docs; resolution wall-clock (measure `executeRuns` with an instant LLM) is under 500 ms.
  - **NFR-9:** two runs with identical fixtures give byte-identical `prompt_assembly.specs` and deep-equal `specs_read`.
- **Acceptance criteria**: all cases pass under `scripts/verify.sh server server/test/project-context-run.test.ts`.

### Step 3: Context API integration tests (DB-backed)
- **Domain**: backend
- **Module(s)**: `server/test/`
- **Layer**: presentation (route-level tests only)
- **Files likely touched**: new `server/test/project-context.it.test.ts`
- **Covers**: AC-1, AC-2, AC-3, AC-4, AC-7 (API), AC-8 (no write endpoint), AC-9 (API), AC-12 (API), AC-16, AC-17, AC-18, AC-32 (API), AC-35 (repo filter), AC-56, AC-57, AC-58 (HTTP), NFR-5
- **Required skills**: fastify-best-practices, drizzle-orm-patterns, security
- **Depends on**: Step 1, so it exercises the final adapter wiring.
- **Can run in parallel with**: Step 4
- **What to do**: follow `server/test/skill-stats.it.test.ts` (`startPg`, `seed`, `buildApp` with mock git/github, `dockerAvailable` skip). Insert a repo row whose `clonePath` points at a tmp dir with a fixture tree; the real `FsDocStore` is used. Cases:
  - **List (AC-1–4):** `GET /repos/:id/context` returns exactly the expected path set and types, plus `roots`, `glob`, `budget_tokens`, `truncated: false`.
  - **AC-9:** write a new `specs/new.md` → a second GET includes it, and `scanned_at` is later.
  - **AC-12:** a repo with a non-existent `clonePath` → 409 with code `repo_not_cloned`.
  - **Detail (AC-7):** `GET /repos/:id/context/file?path=` → `content`, `tokens`, `used_by`, `used_by_names`. An undiscovered path → 404.
  - **AC-16/17/18 + AC-56:**
    - `PUT /agents/:id/context` with `[a,b]` → GET returns `own` = `[a,b]`, the agent version is +1, and that version's snapshot `context_paths` is `[a,b]` (use the existing agent versions endpoint exercised in `agents-versions.it.test.ts`).
    - PUT `[b,a]` → order persisted and version +1.
    - PUT `[b]` → a removed.
    - Re-PUT the same list → no bump.
  - **AC-57:** `PUT /skills/:id/context` → skill version +1, and the `skill_versions` row has `context_paths` in order.
  - **AC-32 / AC-35:**
    - Link the skill to the agent (enabled) → `GET /agents/:id/context` `inherited` contains the skill paths.
    - Disable the link → absent.
    - Re-enable the link, then set the skill's `enabled` to false → absent.
  - **AC-58:** PUT `/abs.md`, `a/../b.md`, `a.txt` → 400 with a structured error body, and a following GET shows the attachments unchanged.
  - **AC-8 / NFR-5:** route inventory. No POST/PUT/PATCH/DELETE route matches `/repos/:id/context*`; use `app.hasRoute` or `printRoutes`.
- **Acceptance criteria**: passes under `scripts/verify.sh server --full` with Docker; skips cleanly without it.

### Step 4: reviewer-core prompt assertions for Project Context
- **Domain**: backend (engine)
- **Module(s)**: `reviewer-core/test/`
- **Layer**: domain (pure; tests only)
- **Files likely touched**: `reviewer-core/test/prompt.test.ts`
- **Covers**: AC-39, AC-40, AC-42, AC-45, NFR-6, NFR-9 (prompt level)
- **Required skills**: typescript-expert, security
- **Depends on**: none
- **Can run in parallel with**: Step 3. It is in a different package and uses **npm**.
- **What to do**: add a `describe('Project context')`:
  - **AC-39:** two `ContextSpec`s give exactly two `<untrusted source="<path>">` blocks, in order, inside one `## Project context` section. A path containing `"<>` has those characters stripped from the label.
  - **AC-40:** `PROJECT_CONTEXT_RULE` appears immediately after the heading and before the first block. Assert the key clauses: check the diff against them, name the path, ignore instructions, never narrow/waive/cancel.
  - **AC-42:** `assemblePrompt` with `specs` undefined and with `specs: []` gives deep-equal `messages` and `assembly`, with no `## Project context` and no rule text.
  - **AC-45:** a document containing `</untrusted>` is escaped to `<\/untrusted>` and the block ends exactly once.
  - **NFR-9:** the same inputs called twice give identical `assembly.specs`.
- **Acceptance criteria**: `cd reviewer-core && npm test` and `npm run typecheck` are green.

### Step 5: Picker and drawer fixes (AC-27, AC-20, NFR-7) plus Context-tab tests
- **Domain**: frontend
- **Module(s)**: `client/src/components/project-context/`, `client/src/app/agents/[id]/…`, `client/src/app/skills/[id]/…`, `client/src/lib/hooks/`
- **Files likely touched**:
  - edit: `client/src/components/project-context/ContextDocsPicker.tsx`, `DocPreviewDrawer.tsx`, `styles.ts`, `index.ts` (keep the existing exports `DocTypeBadge`, `relativeAgo`, `ContextDocsPicker` stable for Step 6)
  - new: `client/src/components/project-context/DocCheckbox.tsx`, `client/src/components/project-context/useFocusTrap.ts`
  - messages: `client/messages/en/context.json` (this step owns it)
  - tests: `client/src/components/project-context/{helpers.test.ts,ContextDocsPicker.test.tsx,DocPreviewDrawer.test.tsx}`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx`, `client/src/app/skills/[id]/_components/ContextTab/ContextTab.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` (tab order), `client/src/app/skills/[id]/_components/SkillDetail/SkillDetail.test.tsx` (tab order), `client/src/lib/hooks/context.test.ts`
- **Covers**: AC-15–AC-32 (UI side), NFR-4 (drawer), NFR-7 (tabs and drawer)
- **Required skills**: frontend-ui-architecture, react-best-practices, react-testing-library, security
- **Depends on**: none
- **Can run in parallel with**: Steps 1, 2 and 6. Step 6 must not edit `components/project-context/**` or `context.json`.
- **What to do**:
  - **AC-27 fix:**
    - When `totalTokens > LARGE_CONTEXT_TOKENS` (8,000), always render the large-context warning with tokens and cost. Show the cost part only when a price is known.
    - When `totalTokens > budget`, additionally render the over-budget warning.
    - Both use `role="status"`.
  - **`DocCheckbox`:** a local native `<input type="checkbox">`, visually matching the kit, with `aria-label` containing the path.
    - Own and available rows: "Attach {path}" / "Detach {path}".
    - Inherited rows: "{path} — inherited from {skill}", plus `disabled`, so it can't be toggled (AC-20).
    - Replace the vendored `Checkbox` and the wrapper-span label in the picker.
  - **Drag handle:** keep `draggable`, add `role="img"` with the existing `dragAria` label so it has an accessible name containing the path (NFR-7). The move-up/down buttons remain the keyboard path (AC-19).
  - **Focus trap:** `useFocusTrap(containerRef)` remembers `document.activeElement` on mount, moves focus into the drawer, wraps Tab and Shift+Tab, and restores focus on unmount. Apply it in `DocPreviewDrawer` via a wrapping element inside the vendored `Drawer` children/title. Do not edit `vendor/ui`.
  - **Tests (RTL, mocked hooks/fetch):**
    - `helpers.test.ts`: `effectivePaths` dedup, `pathsSkippedByBudget` (no back-fill; unknown costs 0), `movePath`, `dropPath`.
    - `ContextDocsPicker.test.tsx`:
      - row contents: checkbox, name, dir, type badge text, Preview (AC-15);
      - checking or unchecking calls `onChange` with the right ordered paths (AC-16/17);
      - move up/down via keyboard reorders (AC-18/19);
      - inherited row is disabled and labelled (AC-20);
      - 7-doc fixture, 2 own + 1 inherited duplicate → "2 of 7 attached" (AC-21);
      - footer "≈ T tokens" equals the sum over the effective set (AC-22);
      - an own path missing from the list shows the "not found in <repo>" row, and Remove drops it (AC-23);
      - the filter `secur` keeps only matching rows in order (AC-26);
      - 9,000 tokens with a price → warning with tokens and cost; without a price → tokens only (AC-27);
      - 30,000 tokens over a 24,000 budget → both warnings, and "will be skipped: budget" on the right rows (AC-28);
      - untrusted footer copy (AC-29);
      - skill mode title "Project context to use" and SERIALIZES AS text equals `"## Project context\n- specs/public-api.md"` (AC-30/31);
      - every checkbox, eye and drag control can be found by an accessible name containing its path (NFR-7).
    - `DocPreviewDrawer.test.tsx`:
      - path, badge, usage, tokens, toggle and markdown shown (AC-24);
      - the toggle calls `onToggle`, and the picker row checkbox state flips (AC-25, via the picker integration test);
      - a doc with `<script>` and `<img onerror>` renders as inert text, with no `script`/`img` element in the DOM (NFR-4);
      - focus moves into the drawer, Tab wraps, and closing returns focus to the Preview button (NFR-7).
    - `ContextTab.test.tsx` (agent and skill): mutations send `PUT …/context` with the ordered paths (AC-16/17/18 UI side).
    - `context.test.ts`: `useSetSkillContext` success invalidates `["agent-context"]` (AC-32).
    - `AgentEditor.test.tsx`: tab order Skills → Context → Evals (AC-15).
    - `SkillDetail.test.tsx`: Config → Context → Preview (AC-30).
  - All new copy goes into `context.json` (Localisation).
- **Acceptance criteria**: `scripts/verify.sh client <touched files>` is green; no edits under `client/src/vendor/**`.

### Step 6: Project Context page extraction and tests, trace drawer and nav tests
- **Domain**: frontend
- **Module(s)**: `client/src/app/repos/[repoId]/context/`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/`, `client/src/components/app-shell/`
- **Files likely touched**:
  - edit: `client/src/app/repos/[repoId]/context/page.tsx` (make it thin)
  - new: `client/src/app/repos/[repoId]/context/_components/ProjectContextView/{ProjectContextView.tsx,ProjectContextView.test.tsx,index.ts}`
  - move: `client/src/app/repos/[repoId]/context/styles.ts` into that folder
  - new tests: `RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx`, `RunTraceDrawer/_components/PromptModalBody/PromptModalBody.test.tsx`, `RunTraceDrawer/helpers.test.ts`, `client/src/components/app-shell/helpers.test.ts`
  - `client/messages/en/runs.json` only if a string is missing. Do not touch `context.json`; reuse existing keys.
- **Covers**: AC-5–AC-14, AC-47–AC-50, AC-52, NFR-4 (page), NFR-7 (page)
- **Required skills**: frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library
- **Depends on**: none
- **Can run in parallel with**: Steps 1, 2 and 5
- **What to do**:
  - Move the page body, including `DocPane`, into `ProjectContextView` with no behaviour change. `page.tsx` renders it.
  - Tests (mock `next/navigation`, `useContextDocuments`/`useContextDocument`, `useActiveRepo`):
    - header shows the roots and glob (AC-5);
    - filter `secur` leaves only `specs/security-baseline.md` (AC-6);
    - selecting a row shows the rendered preview, path, type badge, tokens and "Used by N agents · M skills" (AC-7);
    - no Edit/New/Upload/folder controls (AC-8);
    - Refresh calls `refetch` and the footer shows "Indexed: N files · last …" (AC-9);
    - pending shows skeletons (AC-10);
    - the empty list shows the empty state naming the roots and glob (AC-11);
    - `ApiError` with code `repo_not_cloned` shows the "Repository not cloned" state (AC-12);
    - other errors show the error state, and Retry calls `refetch` (AC-13);
    - a preview with `<script>` stays inert (NFR-4);
    - the list rows and filter have accessible names (NFR-7).
  - Nav (AC-14): `activeKeyFor('/repos/r1/context') === 'context'`, and `NAV` has a WORKSPACE item `context` with href `/repos/:repoId/context`.
  - `TraceBody.test.tsx`:
    - the "Specs read" row lists each path with a token badge and a status label for missing/skipped (AC-47);
    - the "Project context — attached specs (untrusted)" block is present, and copy writes `prompt_assembly.specs` to a mocked clipboard (AC-48);
    - expand shows a modal whose body equals `prompt_assembly.specs`, with search (AC-49);
    - clicking an included path opens the modal with that segment highlighted and focused (AC-50; mock `scrollIntoView`);
    - a legacy trace with `specs_read: ['specs/a.md']` renders the path with no token badge and doesn't crash (AC-52).
  - `helpers.test.ts`: `specEntries` normalises legacy strings.
  - `PromptModalBody.test.tsx`: `focusSource` highlights the matching `<untrusted source=…>` line.
- **Acceptance criteria**: `scripts/verify.sh client <touched files>` is green; `page.tsx` has no feature logic left.

### Step 7: Docs and stale INSIGHTS
- **Domain**: backend + docs
- **Module(s)**: `server/README.md`, `server/.env.example`, root `INSIGHTS.md`
- **Files likely touched**: those three
- **Covers**: infra (accepted Rec 6)
- **Required skills**: doc-writer, engineering-insights
- **Depends on**: Steps 1–6
- **Can run in parallel with**: none (final batch)
- **What to do**:
  - Add a `context` node to the `server/README.md` API map: `/repos/:id/context · /context/file · /agents/:id/context · /skills/:id/context`. Mention the `docstore` adapter.
  - Document `CONTEXT_ROOTS` (default `.`), `CONTEXT_GLOB` (default `**/specs/**/*.md`) and `CONTEXT_BUDGET_TOKENS` (default 24000) in `server/.env.example`.
  - Via `engineering-insights`, mark the 2026-10-03 root entry ("staged but has no server route") as superseded and record the non-obvious decisions: deviations 1 and 2, and the in-adapter port pattern for `DocStore`.
- **Acceptance criteria**: the docs match the code; no edits to `specs/**`.

## Coverage

| Spec ID | Step(s) | Planned test (package · file · kind) |
|---|---|---|
| AC-1 | 1, 3 | server · `docstore-fs.test.ts`, `context-service.test.ts` · unit; `project-context.it.test.ts` · it |
| AC-2 | 1, 3 | server · `docstore-fs.test.ts` · unit; `project-context.it.test.ts` · it |
| AC-3 | 1, 3 | server · `docstore-fs.test.ts` · unit; `project-context.it.test.ts` · it |
| AC-4 | already implemented (+ tests in steps 1, 3) | server · `project-context.test.ts` (existing), `context-service.test.ts` · unit; `.it` |
| AC-5 | 6 | client · `ProjectContextView.test.tsx` · unit |
| AC-6 | 6 | client · `ProjectContextView.test.tsx` · unit |
| AC-7 | 6, 3, 1 | client · `ProjectContextView.test.tsx`; server · `project-context.it.test.ts` · it; `context-service.test.ts` (used_by) |
| AC-8 | 6, 3 | client · `ProjectContextView.test.tsx`; server · `project-context.it.test.ts` route inventory · it |
| AC-9 | 6, 3 | client · `ProjectContextView.test.tsx`; server · `project-context.it.test.ts` · it |
| AC-10 | 6 | client · `ProjectContextView.test.tsx` · unit |
| AC-11 | 6 | client · `ProjectContextView.test.tsx` · unit |
| AC-12 | 1, 3, 6 | server · `context-service.test.ts` · unit, `.it` · it; client · `ProjectContextView.test.tsx` |
| AC-13 | 6 | client · `ProjectContextView.test.tsx` · unit |
| AC-14 | 6 | client · `components/app-shell/helpers.test.ts` · unit |
| AC-15 | 5 | client · `ContextDocsPicker.test.tsx`, `AgentEditor.test.tsx` · unit |
| AC-16 | 3, 5 | server · `project-context.it.test.ts` · it; client · `ContextDocsPicker.test.tsx`, agent `ContextTab.test.tsx` |
| AC-17 | 3, 5 | same as AC-16 |
| AC-18 | 3, 5 | same as AC-16 |
| AC-19 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-20 | 5 (fix) | client · `ContextDocsPicker.test.tsx` · unit |
| AC-21 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-22 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-23 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-24 | 5 | client · `DocPreviewDrawer.test.tsx` · unit |
| AC-25 | 5 | client · `DocPreviewDrawer.test.tsx`, `ContextDocsPicker.test.tsx` · unit |
| AC-26 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-27 | 5 (fix) | client · `ContextDocsPicker.test.tsx` · unit |
| AC-28 | 5 | client · `ContextDocsPicker.test.tsx`, `helpers.test.ts` · unit |
| AC-29 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-30 | 5 | client · `SkillDetail.test.tsx`, skill `ContextTab.test.tsx`, `ContextDocsPicker.test.tsx` · unit |
| AC-31 | 5 | client · `ContextDocsPicker.test.tsx` · unit |
| AC-32 | 3, 5 | server · `project-context.it.test.ts` · it; client · `lib/hooks/context.test.ts` · unit |
| AC-33 | already implemented (+ test step 2) | server · `project-context-run.test.ts` · unit |
| AC-34 | already implemented (+ test step 2) | server · `project-context-run.test.ts` · unit |
| AC-35 | already implemented (+ tests steps 2, 3) | server · `project-context-run.test.ts` · unit; `project-context.it.test.ts` · it |
| AC-36 | already implemented as base **branch**, deviation 1 (+ test step 2) | server · `project-context-run.test.ts` · unit |
| AC-37 | already implemented and tested (+ step 2) | server · `project-context.test.ts` (existing), `project-context-run.test.ts` · unit |
| AC-38 | already implemented (+ test step 2) | server · `project-context-run.test.ts` · unit |
| AC-39 | already implemented and tested (+ step 4) | server · `project-context.test.ts` (existing); reviewer-core · `test/prompt.test.ts` · unit |
| AC-40 | already implemented and tested (+ step 4) | same as AC-39 |
| AC-41 | already implemented and tested (+ step 2) | server · `project-context.test.ts` (existing), `project-context-run.test.ts` · unit |
| AC-42 | already implemented (+ tests steps 2, 4) | reviewer-core · `test/prompt.test.ts`; server · `project-context-run.test.ts` · unit |
| AC-43 | already implemented and tested (+ step 2) | server · `project-context.test.ts` (existing), `project-context-run.test.ts` · unit |
| AC-44 | already implemented and tested (+ step 2) | server · `project-context-run.test.ts` · unit |
| AC-45 | already implemented and tested (+ step 4) | server · `project-context.test.ts` (existing); reviewer-core · `test/prompt.test.ts` · unit |
| AC-46 | already implemented (+ test step 2) | server · `project-context-run.test.ts` · unit |
| AC-47 | already implemented (+ test step 6) | client · `TraceBody.test.tsx` · unit |
| AC-48 | already implemented (+ test step 6) | client · `TraceBody.test.tsx` · unit |
| AC-49 | already implemented (+ test step 6) | client · `TraceBody.test.tsx` · unit |
| AC-50 | already implemented (+ test step 6) | client · `TraceBody.test.tsx`, `PromptModalBody.test.tsx` · unit |
| AC-51 | already implemented (+ test step 2) | server · `project-context-run.test.ts` · unit |
| AC-52 | already implemented (+ test step 6) | client · `TraceBody.test.tsx`, `RunTraceDrawer/helpers.test.ts` · unit |
| AC-53 | already implemented and tested (kept intact by step 1) | server · `project-context.test.ts` (existing) · unit |
| AC-54 | already implemented and tested (kept intact by step 1) | server · `project-context.test.ts` (existing) · unit |
| AC-55 | deferred to manual verification (agreed): see Verification notes | — |
| AC-56 | already implemented (+ test step 3) | server · `project-context.it.test.ts` · it |
| AC-57 | already implemented (+ test step 3) | server · `project-context.it.test.ts` · it |
| AC-58 | already implemented (+ tests steps 1, 3) | server · `context-service.test.ts` · unit; `project-context.it.test.ts` · it |
| NFR-1 | 2 | server · `project-context-run.test.ts` (20 docs, < 500 ms) · unit |
| NFR-2 | 1 | server · `docstore-fs.test.ts` (500 files, warm list < 1 s) · unit |
| NFR-3 | already implemented (+ test step 2) | server · `project-context-run.test.ts` (1 LLM call, budget) · unit |
| NFR-4 | 5, 6 | client · `DocPreviewDrawer.test.tsx`, `ProjectContextView.test.tsx` · unit |
| NFR-5 | 1, 3 | server · `docstore-fs.test.ts` (containment) · unit; `.it` route inventory · it |
| NFR-6 | 4 | reviewer-core · `test/prompt.test.ts` · unit |
| NFR-7 | 5 (fix), 6 | client · `ContextDocsPicker.test.tsx`, `DocPreviewDrawer.test.tsx`, `ProjectContextView.test.tsx` · unit |
| NFR-8 | 2 | server · `project-context-run.test.ts` · unit |
| NFR-9 | 2, 4 | server · `project-context-run.test.ts`; reviewer-core · `test/prompt.test.ts` · unit |
| NFR-10 | 2 | server · `project-context-run.test.ts` · unit |

## Execution guidance (multi-agent)
- **Batch 1 (4 concurrent `implementor`s): Steps 1, 2, 5, 6.**
  - The file scopes don't overlap. Step 1 owns `container.ts`, `mocks.ts`, `modules/context/**`, `platform/project-context.ts`, `project-context.test.ts`, `docstore-fs.test.ts` and `context-service.test.ts`. Step 2 owns only `project-context-run.test.ts`. Step 5 owns `components/project-context/**`, `context.json`, the agent/skill ContextTab and editor tests, and `lib/hooks/context.test.ts`. Step 6 owns `app/repos/[repoId]/context/**`, the `RunTraceDrawer` tests, `app-shell/helpers.test.ts`, and `runs.json` if needed.
  - Step 6 imports `DocTypeBadge`/`relativeAgo` from `components/project-context`. Step 5 must keep those exports and signatures unchanged.
  - Steps 1 and 2 are both in `server/` but share no files, and Steps 5 and 6 are both in `client/` but share no files. **No worktrees.** The session runs `scripts/verify.sh server` and `scripts/verify.sh client` after the batch merges.
- **Batch 2 (2 concurrent): Steps 3 and 4.** Step 3 needs Step 1 merged. Step 4 is in a separate package (npm) and could run in Batch 1, but it sits here to keep Batch 1 at 4.
- **Batch 3 (sequential): Step 7**, after everything has landed.

## Verification notes
- **AC-55 (manual, live model):** seed a repo whose `specs/architecture.md` (under the default `specs/` glob) states "the `api/` module must not import `db/` directly". Open a violator PR where `src/api/x.ts` imports `../db/...`. Attach the doc to an agent in the Context tab and run a review with a real model. Expected:
  - the trace "Specs read" shows the doc as included with its tokens;
  - at least one finding on the import line names `specs/architecture.md` in its rationale.

  Record the run id and outcome in this section when done. Note that the spec's example uses `docs/architecture.md`, which the default glob no longer discovers. Either set `CONTEXT_GLOB` to include `docs/` for the run or use `specs/`.

## Out of scope / follow-ups
- `server/src/modules/reviews/run-executor.ts:259/267` passes `skills:` twice in one object literal (`skillBlocks`, then `skillBodies`). This predates the feature and is not planned here.
- Adding the `/repos/:repoId/context` route to `client/README.md`. Optional; `doc-writer` may pick it up.
- Spec housekeeping is yours to do: `Plan:` and `Status:` fields, and writing deviations 1 and 2 back into the spec if you want them reflected there.

## Definition of done
- Per step: `scripts/verify.sh <pkg> <touched files>` while building. Server and client use **pnpm**, reviewer-core uses **npm**; never mix them.
- After all steps land, once per touched package:
  - `scripts/verify.sh server --full` (includes the `.it` Docker lane)
  - `scripts/verify.sh client --full`
  - `scripts/verify.sh reviewer-core --full`
- Typecheck is clean in each: `cd server && pnpm typecheck`, `cd client && pnpm typecheck`, `cd reviewer-core && npm run typecheck`.
- Gates, in the order `/implement-plan` encodes:
  1. `plan-verifier` against the spec and this plan; every Coverage row is covered, and AC-55 is manual.
  2. `pr-self-review` before any PR.
  3. `engineering-insights` (Step 7 already records the main entries; add anything else non-obvious that comes up during the build).
- Save this plan verbatim to `docs/plans/2026-10-03-project-context.md` (the session writes it; this agent is read-only).
