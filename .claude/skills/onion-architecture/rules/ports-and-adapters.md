# Ports and adapters

DevDigest already implements ports-and-adapters for every external system — this is the strongest part of the existing architecture and the pattern every new integration should copy exactly.

## Where ports live

`server/src/vendor/shared/adapters.ts` (mirrored at `client/src/vendor/shared/adapters.ts` — see root `CLAUDE.md` do-not-touch: diff both sides before editing only one) declares the interfaces: `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider`. These are the **ports** — the Application layer's contract with the outside world, expressed as plain TypeScript interfaces (some backed by Zod schemas for the wire shapes, e.g. `ModelInfo`).

## Where adapters live

`server/src/adapters/<port>/` — one folder per port, containing the real implementation(s):
- `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts` implement `LLMProvider`
- `adapters/github/octokit.ts` implements `GitHubClient`
- `adapters/git/simple-git.ts` implements `GitClient`
- `adapters/codeindex/ripgrep.ts` implements `CodeIndex`
- `adapters/embedder/openai.ts` implements `Embedder`
- `adapters/secrets/local.ts`, `adapters/auth/local.ts` implement `SecretsProvider` / `AuthProvider`

`adapters/mocks.ts` holds test-double implementations of the same ports, injected through `ContainerOverrides` (see `dependency-injection.md`).

## Rule for adding a new external integration

1. Define the port interface in `vendor/shared/adapters.ts` (and mirror it to the client-side copy if it's a cross-cutting contract — check with `diff` first).
2. Implement it under `adapters/<new-port>/`.
3. Wire it into `platform/container.ts` as a lazy getter or async resolver (follow the existing `git`/`github`/`llm` patterns).
4. Add a mock implementation to `adapters/mocks.ts` so tests can inject it via `ContainerOverrides` instead of hitting the real service.

## Rule for services

A `service.ts` may import a **port type** (`import type { LLMProvider } from '@devdigest/shared'`) but must never import a **concrete adapter class** (`OpenAIProvider`, `OctokitGitHubClient`). If a service needs an adapter, it gets it from the `Container` (`container.llm('openai')`, `await container.github()`), not from a direct import.
