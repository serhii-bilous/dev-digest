# client/ — CLAUDE.md

`@devdigest/web` — Next.js studio UI. Map only; see `README.md` for the UI
route map diagram.

## Stack
Next.js 15 (App Router) · React 19 · TanStack Query · `next-intl` ·
Tailwind 4 · vitest + jsdom.

## Commands
```
pnpm dev          # :3000
pnpm test         # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
```

## Map
- `src/app/<route>/page.tsx` — file-based routing; keep pages thin.
- `src/app/<route>/_components/<Name>/` — feature logic, each with a colocated `*.test.tsx`.
- `src/lib/hooks/*.ts` — every API call goes through a hook here.
- `src/lib/api.ts` — low-level fetch client (`NEXT_PUBLIC_API_BASE`).
- `src/vendor/ui/` — vendored UI kit (`@devdigest/ui`).
- `src/vendor/shared/` — mirrors `server/src/vendor/shared` (Zod contracts).

## Read when
- Adding a page/route or a new API call → `README.md` (UI route map diagram).
- Changing shared UI primitives → `src/vendor/ui/README.md`.
- Writing a component test → RTL patterns (`.claude/skills/react-testing-library`).
- Drafting a change before building it → `specs/`. A gotcha not obvious from
  the code → `INSIGHTS.md`. Deeper design notes → `docs/`.
- Finishing a task with a non-obvious lesson → capture it via
  `.claude/skills/engineering-insights` (or run `/engineering-insights`);
  treat existing `INSIGHTS.md` entries as high-confidence guidance before
  starting related work.

## Gotchas
- `src/vendor/shared` is **not** auto-synced with the server copy — it's a
  manually mirrored file set; diff it before assuming a contract matches.
- `fetch` is globally mocked in tests (`src/test/setup.ts`) — a real network
  call inside a test means the mock wasn't wired, not that the API is reachable.

## Do-not-touch
- `src/vendor/ui`, `src/vendor/shared` — vendored/mirrored; edit deliberately and check the other side.
