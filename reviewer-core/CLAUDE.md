# reviewer-core/ — CLAUDE.md

`@devdigest/reviewer-core` — pure review engine, diff → prompt → LLM →
grounded findings. Map only; see `README.md` for the pipeline diagram.

## Stack
Plain TypeScript · Zod · vitest. No DB/FS/network side effects except one
**injected** `LLMProvider` — that's what makes it mock-testable.

## Commands
```
pnpm test         # hermetic, stubbed LLMProvider — no keys, no network
pnpm typecheck    # doubles as "build" — package never emits JS
```

## Map
- `prompt.ts` — `assemblePrompt()`: diff + system prompt + repo map → final
  prompt; `wrapUntrusted()` / `INJECTION_GUARD` live here.
- `grounding.ts` — `groundFindings()`: mandatory citation gate, drops findings
  that don't cite a real diff line.
- `llm/` — `LLMProvider` interface + `openrouter.ts` implementation (injected, mockable).
- `review/run.ts` — orchestrates one review pass.
- `output/to-review.ts` — CI payload shaping (consumed starting course lesson L06).

## Read when
- Changing prompt assembly or the injection defense → `README.md` (pipeline
  diagram). `INJECTION_GUARD` is a deliberate trust-boundary rule, not a
  keyword filter — don't turn it into one.
- Adding a new optional prompt slot (skills/memory/specs) → check the existing
  slot pattern in `assemblePrompt` first, it's designed for this.
- Drafting a change before building it → `specs/`. A gotcha not obvious from
  the code → `INSIGHTS.md`. Deeper design notes → `docs/`.
- Finishing a task with a non-obvious lesson → capture it via
  `.claude/skills/engineering-insights` (or run `/engineering-insights`);
  treat existing `INSIGHTS.md` entries as high-confidence guidance before
  starting related work.

## Gotchas
- The model's self-reported score is discarded — `groundFindings()` recomputes
  it from surviving findings only. Don't trust a raw score from new LLM output.
- Consumed as TypeScript **source** via a tsconfig path alias, not a build
  artifact — don't add a real bundler step without checking every consumer.

## Do-not-touch
- `grounding.ts`'s citation gate — the safety mechanism against hallucinated
  line references; loosening it needs explicit sign-off.
