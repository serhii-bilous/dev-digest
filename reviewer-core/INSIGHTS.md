# Insights — reviewer-core

Engine decisions and dead ends. Read before changing prompt assembly, structured
output, or grounding — the constraints here are deliberate.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-07-31 — Mechanical grounding gate, not a trusted model

**What:** every finding must cite a real line in the diff or it is dropped, and
the verdict score is recomputed from the surviving findings.
**Why:** the model reliably invents plausible line references, and a citation
check is verifiable where a self-reported confidence is not.
**Rejected:** trusting the model's own locations and score. Findings pointed at
lines that were not in the diff, and the score did not move when they were
removed.

### 2026-08-21 — All-chunks-failed in map-reduce throws, doesn't degrade silently

**What:** in `reviewPullRequest`'s map-reduce path, if every chunk's LLM call
fails, the engine now throws (`All N map-reduce chunk(s) failed — review could
not be completed`) instead of continuing.
**Why:** `reduceReviews([])` → 0 findings → `scoreFromFindings([])` = 100,
verdict `approve` — a total LLM outage (bad credentials, rate limit) was
indistinguishable from a genuinely flawless PR. Single-pass already throws on
its one failure; map-reduce's all-fail case is the same situation and needed
the same contract. `server/.../run-executor.ts`'s existing catch block already
persists a `failed` run + error message, so no caller change was needed.
**Rejected:** keeping the silent-degrade and just emitting an `info` log event
(the pre-existing behavior) — the event is easy to miss and the persisted
review still reads as "0 findings, approved."
`src/review/run.ts:300` (throw); `test/run.test.ts` ("map-reduce chunk
failures" describe block).

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

_None yet._

## Recurring Errors & Fixes

_None yet._

## Open Questions

- **2026-08-21** — the citation-grounding gate (`groundFindings`) verifies a
  finding's `file:line` exists in the diff, but never verifies the finding's
  *quoted content* at that location. A cheap model (gemini-2.5-flash-lite)
  reported a "hardcoded Stripe secret `sk_live_xxx`" finding citing a real
  line whose diff hunk shows `sk_live_xxx` only on the removed (`-`) side,
  replaced by a placeholder on the added (`+`) side — a real citation, false
  claim about current content. Confirmed as a hallucination by reading the
  actual file (`grep` showed no `sk_live_xxx` anywhere outside `-` lines).
  Location-only grounding cannot catch this class of error; content
  verification would need to diff the model's quoted excerpt against the
  actual hunk text. Not fixed — `grounding.ts`'s citation gate is
  do-not-touch without sign-off (`reviewer-core/CLAUDE.md`).
