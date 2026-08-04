# server/INSIGHTS.md

Non-obvious lessons specific to `server/` — a gotcha that isn't guessable
from the code, a workaround for a specific bug, a decision that looks wrong
without the context behind it. Append one short entry per topic; don't
restate what's already in `README.md` or `CLAUDE.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- Newer Anthropic models (e.g. Opus 5) reject requests with a `temperature`
  param at all — a 400, not a clamped/ignored value — even the harmless
  `0` / `0.2` defaults we used to always send. `server/src/adapters/llm/anthropic.ts`
  now only includes `temperature` in the request when the caller explicitly
  passed one (`req.temperature !== undefined`); omit-by-default, don't
  default-to-a-number.

## Session Notes

## Open Questions
