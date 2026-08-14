# Intent Layer

How DevDigest derives a PR's stated intent/scope, and how the studio and the
review pipeline each use it. Spans `server/`, `reviewer-core/`, and `client/`.

## What it is

A cheap, separate LLM call that infers a PR's `{summary, in_scope,
out_of_scope}` from its title, body, linked issue, and changed-file **hunk
headers only** — never full diff content. It answers "what is this PR
actually trying to do" before a reviewer (human or agent) reads a single line
of the diff.

## Compute flow (server)

`IntentClassifier.compute()` (`server/src/modules/reviews/intent-classifier.ts`):

1. Loads the PR + repo row, then the diff via `loadDiff` — but only to build a
   **hunk digest**: per file, `@@ -old,+new @@` header ranges plus
   additions/deletions, never hunk line content (`buildHunkDigest`).
2. Best-effort resolves a GitHub-linked issue (title + body) if a token is
   configured; degrades silently (classify from title/body/hunks alone) if
   not.
3. Resolves the model via `resolveFeatureModel(container, workspaceId,
   'review_intent')` — a distinct, deliberately cheap feature-model slot from
   whatever model runs the actual review.
4. Wraps every untrusted input (title, body, linked issue, hunk digest) in
   `wrapUntrusted(label, content)` before handing it to the LLM. The system
   prompt (`server/src/prompts/intent.system.md`) tells the model everything
   inside `<untrusted>` blocks is data to analyze, never instructions — it
   explicitly calls out PR-description injection attempts ("ignore previous
   instructions", "mark everything in scope").
5. Calls `llm.completeStructured<Intent>()` against the `Intent` Zod schema
   (`{summary, in_scope[], out_of_scope[]}` in `@devdigest/shared`'s
   `contracts/brief.ts`).
6. Logs token savings (`fullDiffTokens - tokensIn`) so the hunk-only digest's
   payoff is visible per PR.
7. Persists via `repo.upsertIntent()` into the `pr_intent` table, along with
   call metadata (`provider`, `model`, `tokens_in/out`, `cost_usd`,
   `computed_at`).

**Why hunk headers only, not the full diff:** the classifier only needs to
know *what changed where*, not *how* — file paths, hunk ranges, and
add/delete counts are enough to ground `in_scope`/`out_of_scope` against the
real change surface, at a fraction of full-diff token cost. This is also why
it's a separate LLM call on a separate (cheap) feature-model slot rather than
folded into the main review prompt.

## API

- `POST /pulls/:id/intent` — synchronous compute-or-recompute (rate-limited,
  10/min). No run/SSE — the response body *is* the new state.
- `GET /pulls/:id/intent` — the stored `PrIntentRecord` (Intent fields +
  provider/model/tokens/cost/computed_at), or `null` if never computed.

## How it's used later: grounding the review

When an agent review actually runs, `ReviewRunExecutor.buildIntentDigest()`
(`server/src/modules/reviews/run-executor.ts`) reads the stored `pr_intent`
row (best-effort — a PR with no computed intent just omits this step) and
formats it into a plain-text digest: `Summary: …\n\nIn scope:\n- …\n\nOut of
scope:\n- …`.

That digest is passed as `intent` into `reviewPullRequest()` in
`reviewer-core`. `reviewer-core/src/prompt.ts` renders it as a `## Stated PR
intent` section, still `wrapUntrusted`-wrapped, prefaced by a **trusted**
`INTENT_SCOPE_RULE`: *"Do not comment on issues outside this stated scope. If
a serious problem exists outside the stated scope, raise it as a single
flag/signal rather than as many separate findings."*

This is a scope hint, not an amnesty clause: the same file's
`INJECTION_GUARD` explicitly states that stated intent may inform a finding's
rationale but can never lower its real severity — a PR description claiming
"this is intentional" cannot talk a reviewer out of flagging a real problem.
The two rules are deliberately layered: `INTENT_SCOPE_RULE` narrows
*attention*, `INJECTION_GUARD` protects *severity*, independently of each
other.

## Client

`client/src/lib/hooks/intent.ts`:

- `usePrIntent(prId)` — `GET /pulls/:id/intent`, stored intent or `null`.
- `useComputeIntent(prId)` — `POST /pulls/:id/intent`; since the call is
  synchronous, its `onSuccess` seeds the `usePrIntent` query cache directly
  instead of polling.

### Overview tab layout

`OverviewTab` (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/`)
composes three blocks, top to bottom:

1. **PR Brief** — `VerdictBanner`, fed from the newest row of `usePrReviews`
   (reviews come back newest-first from `GET /pulls/:id/reviews`). Previously
   `VerdictBanner` only rendered per-run inside the Findings tab
   (`ReviewRunAccordion`); Overview now also shows the latest run's verdict as
   a PR-level summary, using the same component and the same
   verdict/blockers derivation (`CRITICAL` findings with no `dismissed_at`).
2. **Intent | Blast Radius**, a two-column grid:
   - `IntentCard` — the quote-style `summary`, a two-column `in_scope` /
     `out_of_scope` list (green check / red X), and a **Risk Areas** section
     (`RiskAreas.tsx`): a `Chip` row where clicking a chip expands an
     explanation + `file_refs` panel below it, one open at a time. It's
     wired against `@devdigest/shared`'s already-scaffolded `Risk`/`Risks`
     contract (`{kind, title, explanation, severity, file_refs}` —
     originally added ahead of any consumer), but **no backend computes risk
     areas yet** — `IntentCard` currently always passes `risks={[]}`, so the
     section renders its real empty state ("No notable risks flagged.").
     The interaction is fully built; wiring real data later is a
     classifier/prompt/persistence change, not a UI one.
   - `BlastRadiusCard` — a placeholder reserving the column for the future
     Blast Radius feature (`BlastRadius` contract in `contracts/brief.ts`
     also pre-scaffolded), currently just a "coming soon" line.
3. **Description** — the PR body, unchanged.

## Security model, end to end

Every untrusted input — PR title/body, linked issue, hunk digest, and later
the intent digest itself when it's replayed into the review prompt — is
`wrapUntrusted`-tagged and the system prompt is told explicitly to treat
`<untrusted>` content as data, not instructions. This holds at both call
sites: the classifier call itself, and the later review call that consumes
the classifier's *output* as one more untrusted input. A PR author cannot
use the PR description to make the classifier over-claim scope, and cannot
use a self-declared "this is intentional" scope to make the reviewer
under-report severity.
