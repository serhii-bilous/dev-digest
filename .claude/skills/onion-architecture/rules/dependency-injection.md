# Dependency injection and the composition root

`server/src/platform/container.ts` is the single composition root: the one file in the codebase allowed to construct concrete Infrastructure classes and decide which implementation backs which port.

## Patterns already in `container.ts` to follow

- **Lazy getters** for adapters that don't need async setup: `get git(): GitClient { this._git ??= new SimpleGitClient(this.config.cloneDir); return this._git; }`.
- **Async resolvers** for adapters gated behind a secret: `async llm(id): Promise<LLMProvider>` reads the key via `SecretsProvider`, throws a `ConfigError` if missing, constructs and caches the provider.
- **`ContainerOverrides`** — every adapter getter checks `this.overrides.<name>` first. Tests build a `Container` with overrides instead of monkeypatching modules.
- **Shared repositories as getters** (`agentsRepo`, `skillsRepo`, `reviewRepo`) — constructed once, lazily, and reused by any module's `service.ts`.
- **`invalidateSecretCaches()`** — cached adapter instances are dropped explicitly when a secret changes, rather than services re-reading `process.env` themselves.

## Rules for new code

- A `service.ts` function takes a `Container` (or the specific slice it needs) as a parameter/constructor argument — it never imports and instantiates a concrete adapter itself.
- Secrets are read only through `SecretsProvider` (via the container), never `process.env.X` directly outside `adapters/secrets/` — this matches the root `CLAUDE.md` convention that secrets live in `~/.devdigest/secrets.json`, not `.env`.
- If a new adapter needs construction-time config (a base URL, a timeout), add it to `AppConfig` (`platform/config.ts`) and read it in the container getter — don't thread ad hoc env lookups through `service.ts`.
- Never add a second place in the codebase that constructs `AgentsRepository`, `ReviewRepository`, etc. — always `container.<x>Repo`.
