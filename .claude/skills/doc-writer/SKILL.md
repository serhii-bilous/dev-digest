---
name: doc-writer
description: >-
  Generates or updates documentation for already-implemented DevDigest
  functionality, based on a diff or a set of changed files — never writes
  code or tests. Decides which file the writing goes into (a module's
  `docs/`, a module `README.md`, or the root `README.md`) and whether the
  content can be written directly or needs a draft for review first.
  Triggers: "document this", "write docs for", "update the README",
  "document what changed", "add a doc for this feature".
---

# doc-writer

Writes documentation for work that is already done — the code or diff exists
before this skill runs. It does not design the feature, write the
implementation, or write tests; it describes what was built. If the code
isn't written yet, this is the wrong skill.

## Module resolution

Confirmed against the repo's actual `docs/README.md` files (every package
has one) and root `CLAUDE.md`'s `docs/` vs `README.md` vs `specs/` vs
`INSIGHTS.md` split:

| The change touches | Target | Not here |
| --- | --- | --- |
| `server/**` (excl. vendor) | `server/docs/` — runtime behavior: run lifecycle, DI container, migrations, SSE traces, etc. `src/modules/repo-intel/` keeps its own README next to the code — link, don't copy. | `server/README.md` (route map), `server/specs/` (unbuilt intent), `server/INSIGHTS.md` (rejected approaches) |
| `client/**` (excl. vendor) | `client/docs/` — cache/invalidation strategy, shortcut map, RSC/loading conventions, etc. | `client/README.md` (UI route map) |
| `reviewer-core/**` | `reviewer-core/docs/` — grounding heuristics, prompt slot ordering, `parseWithRepair` failure modes, etc. | `reviewer-core/README.md` (pipeline diagram, public API) |
| `e2e/**` | `e2e/docs/` — special case: it also holds **prose specs** for this package, because `e2e/specs/` is already taken by executable flow files, not prose. | `e2e/README.md` (flow-format walkthrough) |
| Work spanning ≥2 packages, or `scripts/`/`.github/`/root config | root `docs/` — cross-package "how it works today". Don't restate root `README.md`; link to it instead. | — |

If the target `docs/` directory turns out to hold more than a `README.md`
(a focused file per topic) by the time this runs, follow that existing split
rather than always writing into `README.md`.

**No `CHANGELOG.md` convention exists anywhere in this repo** (root or any
module) — confirmed by search before writing this skill. Never create one
silently, even if the user says "add a changelog entry." Ask what they
actually want, or propose recording it in the relevant `<module>/docs/`
instead.

## Pipeline

1. **Read the diff or change** — a pasted diff, a file list, or (when the
   calling session has Bash access) `git diff`/`git status`. This skill
   doesn't dictate which — it inherits whatever tool access the caller has.
2. **Read the relevant changed files** for context — signatures, schemas,
   the actual behavior, not just the diff hunks.
3. **Read the existing target doc file(s) first**, before writing anything —
   the module's `docs/README.md` (or a more specific file already living in
   that `docs/` directory) and any adjacent doc it links to. This avoids
   duplicating what's already documented and keeps new prose in the
   existing file's voice and structure.
4. **Classify the artifact** (see below) and act accordingly.

## Derivative vs. conceptual documentation

This split is deliberate, confirmed with the user — not a default this skill
invented.

**Derivative / reference documentation** — write or append **directly**, no
confirmation needed. It follows mechanically from the code: a function
signature, a Zod schema shape, a factual one-line description of what a
mechanism does.

- A new `computeScore(diff: Diff): number` export with a clear signature and
  no ambiguity in what it returns → write the reference entry directly.
- A new Zod schema `RunStatusSchema` with a fixed enum of states → document
  the shape directly, it's read off the type.
- A new route's request/response shape, already enforced by a schema →
  direct API-reference entry.

**Conceptual documentation** — always **propose a draft** for the user to
review, never silently write or overwrite existing prose. This covers "why"
narrative, architectural rationale, or anything where interpreting intent or
business logic could be wrong.

- "Why we chose map-reduce over one large prompt" → conceptual, draft only.
- Rewriting a `README.md` overview paragraph to reflect a new feature →
  conceptual, draft only — it's prose that represents the package's public
  face.
- Explaining the reasoning behind a retry/backoff policy, not just what the
  numbers are → conceptual, draft only.

When unsure which bucket a piece of writing falls into, treat it as
conceptual — the cost of an unnecessary draft round-trip is lower than the
cost of silently misrepresenting a design decision.

## Hard limits

- Never edits `**/src/vendor/**` or `server/clones/**`.
- Never writes or invents a `CHANGELOG.md` (see above).
- Never invokes the `engineering-insights` recording step itself — that
  skill records durable lessons and rejected approaches, a different purpose
  from documenting current behavior. It may cite `INSIGHTS.md` as read-only
  context but never writes to it.
- Never writes code, never writes tests, never gates or blocks a PR.

## What this skill does not do

It documents already-implemented functionality only. It does not design or
implement the feature, does not write or modify tests, does not gate PRs
(that's `pr-self-review`), and does not record engineering insights (that's
`engineering-insights` — durable lessons and dead ends, not current-state
docs).
