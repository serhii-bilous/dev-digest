---
name: engineering-insights
description: Captures non-obvious lessons learned while working in this repo — a gotcha, a workaround, a decision that looks wrong without its context — into the touched package's INSIGHTS.md. Use after fixing a non-obvious bug, finding a workaround, making a decision an outsider would question, or finishing a session (>30 min) that turned up something worth remembering. Also use on explicit request ("update insights", "wrap up", /engineering-insights).
---

# Engineering Insights

Append (never overwrite) one short entry to `<package>/INSIGHTS.md` — the package the task actually touched — under the section that fits: `What Works` · `What Doesn't Work` · `Codebase Patterns` · `Tool & Library Notes` · `Recurring Errors & Fixes` · `Session Notes` · `Open Questions`.

Test before writing: if this would be obvious to anyone reading the code, don't write it.
- Bad: "be careful with async."
- Good: "`Promise.all()` on the ingest pipeline times out after 30 items — use `Promise.allSettled()` with batches of 10."

Skip trivial sessions. Don't restate what's already in `README.md` or `CLAUDE.md`. Before appending, skim the target section for a conflicting or stale entry — fix that one instead of adding a contradiction.
