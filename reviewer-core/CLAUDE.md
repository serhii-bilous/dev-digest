# reviewer-core (`@devdigest/reviewer-core`) — agent notes

**npm, not pnpm.** This package has its own `package-lock.json`.

## Commands

```sh
npm test           # vitest, hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck  # tsc --noEmit — this IS the build; the package emits no JS
```

## Map

- `prompt.ts` — `assemblePrompt()`: diff + system prompt + repo map → final
  prompt; `wrapUntrusted()` / `INJECTION_GUARD` live here.
- `grounding.ts` — `groundFindings()`: mandatory citation gate, drops findings
  that don't cite a real diff line.
- `llm/` — `LLMProvider` interface + `openrouter.ts` implementation (injected, mockable).
- `review/run.ts` — orchestrates one review pass.
- `output/to-review.ts` — CI payload shaping (consumed starting course lesson L06).

## Conventions

- **Purity is the contract.** No database, no GitHub, no filesystem. The only
  side effect is an LLM call through an **injected** `LLMProvider`. Anything that
  needs I/O belongs in `server/`, not here.
- Consumed as TypeScript source through a tsconfig path alias. Never add a build
  step or import from `dist`.
- The public surface is whatever `src/index.ts` exports. Adding an export is an
  API change; check `server/` consumers first.
- Contracts (`Review`, `Finding`, `Verdict`, …) come from `@devdigest/shared`.
- Untrusted content (diffs, PR bodies) must be fenced with `wrapUntrusted()` +
  `INJECTION_GUARD` before it reaches the prompt.

## Gotchas

- **The grounding gate is mandatory.** A finding that does not cite a real line
  in the diff is dropped. Do not add a bypass — it is what stops hallucinated
  locations.
- The score is **recomputed deterministically** from the surviving findings. The
  model's own score is never trusted.
- `assemblePrompt` accepts optional slots (`skills`, `memory`, `specs`,
  `callers`) that the starter does not fill. Omitted slots render as no section —
  an empty section in the prompt means a caller passed an empty value.

## Do-not-touch

- `grounding.ts`'s citation gate — the safety mechanism against hallucinated
  line references; loosening it needs explicit sign-off.

## Read when

- Read `INSIGHTS.md` first for what was already tried here, and run the
  `engineering-insights` skill at the end of the task to add to it.
- Read `README.md` for the pipeline diagram and the full public API.
- Read `docs/` before changing prompt assembly or the grounding heuristics.
- Read `../docs/agent-prompts/` when the task concerns a built-in agent's system
  prompt or model choice.
