# client/INSIGHTS.md

Non-obvious lessons specific to `client/` — a gotcha that isn't guessable
from the code, a workaround for a specific bug, a decision that looks wrong
without the context behind it. Append one short entry per topic; don't
restate what's already in `README.md` or `CLAUDE.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- `messages/en/evalCases.json`'s `diffPlaceholder` (and `namePlaceholder:
  "stripe-key-leak"`) intentionally embed a synthetic `sk_live_xxx` string —
  it's example copy for the "New eval case" form, demonstrating the exact
  pattern the product's own secret-leakage eval case exists to detect. It is
  not a real credential. An AI reviewer may flag it as a "hardcoded secret";
  don't rewrite the string to placate that — it would defeat the eval case's
  purpose. Dismiss the finding instead.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
