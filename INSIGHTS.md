# Insights — cross-package

Decisions that span more than one package, and things we tried that did not
work. Module-local lessons go in `<module>/INSIGHTS.md` instead.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. Every entry must be actionable cold: claim first, `path:line` or a
runnable command last. If it would be obvious to anyone reading the code, leave
it out.

Roughly 5 entries per section. When an entry becomes stable reference material,
move it into `docs/` and delete it here.

---

## Decisions

### 2026-08-13 — test-writer/architecture-reviewer agents, plan-verifier/doc-writer skills: scoped exceptions to the read-only pattern

**What:** added `.claude/agents/test-writer.md` (read-write: Read, Write,
Edit, Bash, Grep, Glob, Skill) and `.claude/agents/architecture-reviewer.md`
(read-only over code, but with `Bash` scoped to read-only git inspection —
`git diff`/`log`/`show`/`status` only, no write/exec) plus
`.claude/skills/plan-verifier/SKILL.md` and `.claude/skills/doc-writer/SKILL.md`.
`architecture-reviewer` breaks from `planner`/`researcher`'s no-Bash-at-all
pattern specifically so it can discover a diff itself when the caller gives
no explicit file list — it is still forbidden from any non-read git command.
`doc-writer` never auto-writes conceptual documentation (README prose, "why"
rationale) — only derivative/reference docs (function signatures, Zod schema
shapes) get written directly; everything else is proposed as a draft for
review. `doc-writer` also confirmed (via `find -iname 'CHANGELOG*'` excluding
`node_modules`) that no `CHANGELOG.md` convention exists anywhere in this
repo, root or module, and must never invent one silently even if asked for
"a changelog entry."
**Why:** `architecture-reviewer`'s job is reviewing already-written code, so
unlike `planner` (plans before code exists) it plausibly needs to find out
what changed on its own; a narrow Bash allowlist was judged safer than
either full Bash or no Bash. The derivative/conceptual split for
`doc-writer` mirrors external best-practice research (see this entry's
session): auto-committing docs that follow mechanically from code carries
low misinterpretation risk, but business-logic/rationale prose does not.
**Rejected:** giving `architecture-reviewer` no Bash at all (full symmetry
with `planner`/`researcher`) — rejected because it would force every review
request to come with an explicit file list, which is unnecessary friction
that a narrow read-only allowlist avoids without reopening write risk.

### 2026-08-13 — planner/implementor agents: single Implementor, worktree isolation for near-each-other steps

**What:** `.claude/agents/planner.md` and `.claude/agents/implementor.md` use
one `implementor` agent definition for both backend and frontend work,
routed at runtime via a module-path table + the `Skill` tool, rather than
splitting into `implementor-backend`/`implementor-frontend` with
deterministic `skills:` frontmatter preload. Planner's "Parallelization
guidance" now tells the calling session to launch near-each-other steps
(same module, adjacent files, or a shared `@devdigest/shared` contract)
with `isolation: "worktree"` on the `Agent` tool call, and to cap
concurrent `implementor` fan-out at ~4 instances per batch.
**Why:** a single flexible Implementor handles mixed/e2e steps that don't
cleanly split backend/frontend; `skills:` preload would be a stronger
guarantee but forces a fixed domain per agent file. `isolation: worktree`
makes file conflicts physically impossible instead of relying only on each
instance's textual scope discipline; the ~4 fan-out cap follows
practitioner reports (Augment Code, davidloor.com) that orchestrator-style
result aggregation degrades past 4 concurrent workers.
**Rejected:** splitting into two specialized implementor agents with
frontmatter `skills:` preload — deferred, not ruled out; revisit if the
routing-table approach turns out to misroute in practice.

### 2026-07-31 — Standalone packages instead of a workspace

**What:** four packages, each with its own `package.json` and lockfile; sharing
happens through tsconfig path aliases, not published modules. Each suite is
gated by its own CI workflow with a path filter.
**Why:** _rationale not recorded anywhere in the repo — fill this in._ Do not
"fix" this into a workspace before that gap is closed; it is load-bearing for the
per-package CI path filters.

### 2026-07-31 — Zod contracts as the single source of truth

**What:** `@devdigest/shared` schemas drive request validation, response
serialization, and client-side types.
**Why:** one definition, no drift between server and client.
**Rejected:** hand-rolled `Schema.parse(req.body)` inside handlers — it validated
input but left responses unchecked, so contract drift surfaced in the browser.

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

- **2026-08-13** — A `@devdigest/shared` contract scaffolded ahead of its
  consumer (e.g. `PrIntentRecord = Intent.extend({ pr_id: z.string() })`,
  added for a not-yet-built "PR Brief" lesson) can silently stop matching
  what the eventually-built route returns — the classifier this contract was
  meant for ended up returning call metadata (`computed_at`/`provider`/
  `model`/`tokens_*`/`cost_usd`), not `pr_id`. Nothing catches this drift
  automatically since no response Zod schema is declared on most routes here
  (only `params`). When implementing a feature against a contract that
  predates it, diff the contract's fields against what the service/route
  actually constructs before assuming it's still accurate — don't just
  import and trust it. `server/src/vendor/shared/contracts/review-api.ts:59`

- **2026-08-01** — Per-run LLM cost is already computed end-to-end; the only
  thing ever missing is persistence. Every provider returns `costUsd` on its
  result, and for OpenRouter it is the REAL billed figure — the client asks for
  it with `usage: { include: true }` and reads `usage.cost`, falling back to the
  injected `PriceBook` estimator. `reviewPullRequest` then sums it across
  map-reduce chunks onto `ReviewOutcome.costUsd`. Commit `d45ab0d` removed the
  cost *feature* by dropping that one field at the destructure in
  `run-executor.ts` and deleting the `agent_runs.cost_usd` column, leaving the
  computation intact. So surfacing cost anywhere costs **zero extra model
  calls** — wire up the existing field, never add a pricing lookup or a second
  request. `reviewer-core/src/review/run.ts:216`

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Open Questions

_None yet._
