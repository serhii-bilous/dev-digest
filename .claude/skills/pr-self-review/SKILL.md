---
name: pr-self-review
description: "Local pre-PR quality gate for DevDigest. Fans the current pending diff out to the repo's own domain skills — react-best-practices/next-best-practices/react-testing-library for client/ (UI) files, fastify-best-practices/onion-architecture/drizzle-orm-patterns/postgresql-table-design for server/ + reviewer-core/ (backend) files, security/zod/typescript-expert across everything — before a PR is opened. If any CRITICAL finding survives, refuse to run `gh pr create` or `gh pr merge` until it's fixed. Use before every `gh pr create`/`gh pr merge` call, and on request: \"self review\", \"review my changes\", \"am I ready to open a PR\", \"can I merge this\", \"check my diff before I open a PR\". Trigger terms: PR self review, self-review, pre-PR check, merge gate, mergeable, ready to open PR."
---

# PR Self-Review

A local merge gate you run on yourself, mirroring DevDigest's own product
concept of a merge-gate policy — but applied to changes *to* DevDigest before
a PR exists. It does not call GitHub. It re-uses the repo's existing skills
(see `.claude/skills/README.md`) instead of inventing new review rules.

**Advisory, not a technical block.** No hook enforces this — it works because
you (the agent) invoke it before `gh pr create`/`gh pr merge` and refuse to
proceed yourself when it finds a critical issue. Re-state the block if the
user asks you to open/merge the PR anyway without addressing the critical
findings; only drop it if they explicitly override.

## Step 1 — Collect the diff

Run all of these — the union of their file lists is what gets reviewed:

```
git status --porcelain=v1        # untracked + unstaged
git diff --staged                # staged
git diff main...HEAD             # committed since branching off main
```

If there's nothing in any of the three, say so and stop — nothing to review.

## Step 2 — Classify changed files into buckets

| Bucket | Path patterns |
|---|---|
| UI | `client/src/**`, excluding `client/src/vendor/**` |
| Backend | `server/src/**` (excluding `server/src/vendor/**`), `reviewer-core/src/**` |
| Shared contracts | `**/vendor/shared/**` |
| Infra/other | `e2e/**`, `server/src/db/migrations/**`, root config files |

## Step 3 — Invoke matching skills, only for buckets with changes

Don't invoke a skill with nothing relevant in the diff.

- **UI touched** →
  - `react-best-practices` — always, for any changed `client/src/**` `.ts`/`.tsx`
  - `next-best-practices` — if `client/src/app/**` (routes/pages/layouts) changed
  - `react-testing-library` — if a `*.test.tsx` changed, or a component changed with no colocated test
- **Backend touched** →
  - `fastify-best-practices` — any `routes.ts` or plugin change
  - `onion-architecture` — any `modules/<name>/{service,repository,routes}.ts`, `adapters/**`, or `platform/container.ts` change (layering: does `service.ts` leak a Drizzle row or `FastifyRequest`? is a concrete adapter constructed outside `container.ts`?)
  - `drizzle-orm-patterns` — any query/repository change
  - `postgresql-table-design` — any `db/schema/**` or `db/migrations/**` change
- **Cross-cutting** — run if UI OR backend changed →
  - `security` — always; apply its own HIGH/MEDIUM/LOW confidence table, only surface HIGH as critical
  - `zod` — any schema/contract file
  - `typescript-expert` — only for a non-trivial diff (skip for a handful of lines)

## Step 4 — Repo-specific checks (run directly, no sub-skill needed)

- **`vendor/shared` drift**: if `server/src/vendor/shared/**` or
  `client/src/vendor/shared/**` changed, diff the two directories. They're a
  manually mirrored pair (see root `CLAUDE.md` do-not-touch rule) — if they no
  longer match after the change, that's a **critical** finding: a client/server
  contract can silently diverge.
- **Branch naming** (minor): flag if the current branch doesn't match
  `feat/<TAG>-<kebab-case-description>` per root `CLAUDE.md` convention.

## Step 5 — Classify severity (pr-self-review decides this, not the sub-skills)

- **critical** — a security HIGH-confidence finding; an `onion-architecture`
  Dependency Rule violation (inward-only dependencies broken); a broken or
  leaked client/server contract; `vendor/shared` drift (Step 4).
- **major** — a real anti-pattern with no immediate break: missing test for
  new logic, N+1 query, missing RSC/Suspense boundary, anemic-vs-domain
  judgment call that's clearly wrong.
- **minor** — style/naming/nitpick a senior engineer wouldn't block on.

Before assigning severity, apply each invoked skill's own false-positive
filters. Skip: pre-existing issues outside this diff, anything a
linter/typechecker/CI would catch, issues explicitly silenced in code (lint
disable comments), and issues on lines the diff didn't touch.

## Step 6 — Report

Use `ReportFindings`. The tool has no native severity field, so encode
severity as a prefix on `category`: `critical-security`, `critical-layering`,
`critical-contract-drift`, `major-test-coverage`, `minor-naming`, etc.

## Step 7 — Gate

- **Any `critical-*` finding** → do not run `gh pr create` or `gh pr merge`.
  Say plainly: "Merge blocked — N critical issue(s) found," list each with
  file:line, and stop. Wait for a fix, or an explicit user override, before
  proceeding.
- **Major/minor only** → report them, and proceed to `gh pr create`/`gh pr
  merge` only if the user confirms they want to proceed anyway.
- **Nothing found** → say so briefly, proceed.

## Notes / limits

- This does not replace `pnpm test`/CI — it's the same class of judgment-based
  review `/code-review` does, not a build/lint/typecheck run. Assume those run
  separately.
- `onion-architecture`'s `rules/*.md` files (referenced from its own
  `SKILL.md`) don't exist yet — its `rules/` directory is currently empty.
  Fall back to the layer table and Core Principles already inline in
  `onion-architecture/SKILL.md` until those are written.
- `engineering-insights` is intentionally not part of this gate — it's a
  wrap-up skill for capturing lessons learned, a different purpose from
  blocking a merge.
