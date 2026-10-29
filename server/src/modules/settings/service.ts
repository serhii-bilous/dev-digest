import type { Container } from '../../platform/container.js';
import type {
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  LocalStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { LocalProviderError, localUnavailableError, type LocalLogger } from '../../platform/local-errors.js';
import { ValidationError } from '../../platform/errors.js';
import { SettingsRepository } from './repository.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';

/**
 * F1 — settings service. Non-secret workspace prefs, plus the provider
 * connection test.
 *
 * The split that matters here: PREFS live in the `settings` table, KEYS live in
 * SecretsProvider. `secretsStatus` deliberately returns booleans — the values
 * are never read back out over the API.
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.repo.listForWorkspace(workspaceId));
  }

  /** Upsert the supplied prefs, then return the full resulting set. */
  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.repo.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }

  /** Which provider keys are configured — booleans only, never the values. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider credential with a cheap live call (listModels / GET user).
   *
   * A failure is a RESULT, not an exception: the panel renders the message
   * inline, so every path returns `{ ok: false, message }` rather than throwing
   * into the error handler.
   */
  async testConnection(
    provider: ConnTestProvider,
    key?: string,
    logger?: LocalLogger,
  ): Promise<ConnTestResult> {
    try {
      // A supplied key is persisted (BYO key) BEFORE the test, so the test
      // reflects — and the rest of the app can use — the new value.
      if (key) {
        if (!this.container.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.container.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.container.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.container.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      if (provider === 'local') {
        return await this.testLocal(logger);
      }
      const llm = await this.container.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      if (err instanceof LocalProviderError) {
        return { provider, ok: false, message: err.message, reason: err.reason };
      }
      return { provider, ok: false, message: (err as Error).message };
    }
  }

  /** Local availability (CLI version + token presence); no model call. */
  localStatus(): Promise<LocalStatus> {
    return this.container.localStatus();
  }

  /**
   * Persist the Local OAuth token. Stored via the secrets store only; no model
   * call is made and the value is never echoed.
   */
  async saveLocalToken(key: string): Promise<LocalStatus> {
    if (!this.container.secrets.set) throw new ValidationError('Secrets backend is read-only');
    await this.container.secrets.set(SECRET_KEY_BY_PROVIDER.local, key);
    this.container.invalidateSecretCaches();
    return this.container.localStatus();
  }

  /** One minimal CLI call through the slot gate. Failures are results, never throws. */
  private async testLocal(logger?: LocalLogger): Promise<ConnTestResult> {
    const status = await this.container.localStatus();
    if (!status.available) {
      const reason = status.reason ?? 'cli_missing';
      return {
        provider: 'local',
        ok: false,
        reason,
        message: localUnavailableError(reason).message,
      };
    }
    const llm = await this.container.llmFor('local', { runId: 'conn-test', logger });
    await llm.complete({
      model: 'haiku',
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    });
    return {
      provider: 'local',
      ok: true,
      message: `OK — Claude Code CLI ${status.cli_version ?? ''}`.trim(),
    };
  }
}
