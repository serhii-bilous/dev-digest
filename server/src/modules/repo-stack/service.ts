import type { RepoLanguage, RepoStack, RepoStackReason } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, RepoRow } from '../../db/rows.js';
import { NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import {
  classifyFetchError,
  codeLanguagesExact,
  deriveStack,
  diffCompatible,
  incompatibleError,
  isCompatible,
  resolveEntries,
  type ResolvedEntry,
} from '../../platform/stack-compat.js';
import { LANGUAGES_FETCH_TIMEOUT_MS, UNKNOWN_RETRY_COOLDOWN_MS } from './constants.js';
import { RepoStackRepository } from './repository.js';

export interface RepoStackLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn?(obj: Record<string, unknown>, msg?: string): void;
}

export interface RepoStackEvaluation {
  stack: RepoStack;
  entries: ResolvedEntry<AgentRow>[];
  /** Unrounded code-language breakdown (for threshold checks and the 409 details). */
  exact: RepoLanguage[];
}

interface Resolved {
  row: RepoRow;
  stack: RepoStack;
}

/** Stack placeholder when a repo somehow has nothing stored and the fetch path failed. */
const UNREACHABLE: RepoStack = { status: 'unknown', reason: 'unreachable', languages: [] };

/**
 * Application layer: fetches + caches a repo's GitHub language breakdown and
 * answers per-(repo, agent) compatibility/activation. Reads agents through
 * `container.agentsRepo`; never builds Agent DTOs. `ensure` never throws for a
 * fetch problem (NFR-4) — only for a repo outside the caller's workspace (404).
 */
export class RepoStackService {
  private inflight = new Map<string, Promise<Resolved>>();

  constructor(
    private container: Container,
    private repo: RepoStackRepository = new RepoStackRepository(container.db),
    private now: () => number = Date.now,
    private log: RepoStackLogger = { info: () => {} },
  ) {}

  /** Stack for a repo, fetching when needed (AC-3 / AC-44). Never throws on fetch failure. */
  async ensure(
    workspaceId: string,
    repoId: string,
    opts: { force?: boolean } = {},
  ): Promise<RepoStack> {
    return (await this.resolve(workspaceId, repoId, opts)).stack;
  }

  /** Alias of `ensure` for read endpoints (GET /repos/:id/stack). */
  getStack(workspaceId: string, repoId: string): Promise<RepoStack> {
    return this.ensure(workspaceId, repoId);
  }

  /** Compatibility + stored activation of every workspace agent on the repo. */
  async evaluate(workspaceId: string, repoId: string): Promise<RepoStackEvaluation> {
    const { row, stack } = await this.resolve(workspaceId, repoId, {});
    const [agents, states] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.listStates(row.id),
    ]);
    const exact = codeLanguagesExact(row.languages);
    return { stack, entries: resolveEntries(agents, states, stack, exact), exact };
  }

  /** Add (true) / Remove (false). Activating an incompatible agent → 409. */
  async setActive(
    workspaceId: string,
    agentId: string,
    repoId: string,
    active: boolean,
  ): Promise<ResolvedEntry<AgentRow>> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    // Existence (404) is checked before any GitHub fetch can block.
    if (!(await this.repo.getRepo(workspaceId, repoId))) throw new NotFoundError('Repository not found');
    const { row, stack } = await this.resolve(workspaceId, repoId, {});
    const exact = codeLanguagesExact(row.languages);
    const compatible = isCompatible(agent.languages, stack, exact);
    if (active && !compatible) throw incompatibleError(agent.name, agent.languages, exact);
    await this.repo.upsertState(row.id, agent.id, active);
    return { agent, compatible, active };
  }

  /** Poll hook (AC-43): after a successful PR sync, fetch when the stack is unknown/never fetched. */
  async afterPollSuccess(workspaceId: string, repoId: string): Promise<void> {
    try {
      const row = await this.repo.getRepo(workspaceId, repoId);
      if (!row) return;
      const stack = deriveStack(row);
      if (!stack || stack.status === 'unknown') await this.ensure(workspaceId, repoId, { force: true });
    } catch {
      // A language problem must never fail a PR sync.
    }
  }

  // ---- internals ----

  private async resolve(
    workspaceId: string,
    repoId: string,
    opts: { force?: boolean },
  ): Promise<Resolved> {
    const row = await this.repo.getRepo(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repository not found');
    const existing = deriveStack(row);
    if (!opts.force && !this.shouldFetch(row, existing)) {
      return { row, stack: existing ?? UNREACHABLE };
    }
    const running = this.inflight.get(repoId);
    if (running) return running;
    const p = this.fetchAndStore(workspaceId, row, existing).finally(() => {
      this.inflight.delete(repoId);
    });
    this.inflight.set(repoId, p);
    return p;
  }

  private shouldFetch(row: RepoRow, stack: RepoStack | null): boolean {
    if (!row.languagesAttemptedAt) return true;
    if (stack?.status === 'unknown') {
      return this.now() - row.languagesAttemptedAt.getTime() >= UNKNOWN_RETRY_COOLDOWN_MS;
    }
    return false;
  }

  private async fetchAndStore(
    workspaceId: string,
    row: RepoRow,
    before: RepoStack | null,
  ): Promise<Resolved> {
    const at = new Date(this.now());
    let next: RepoRow = row;
    try {
      let languages: Record<string, number> | undefined;
      let failure: Exclude<RepoStackReason, 'no_code_languages'> | undefined;
      try {
        const gh = await this.container.github();
        languages = await withTimeout(
          gh.getLanguages({ owner: row.owner, name: row.name }),
          LANGUAGES_FETCH_TIMEOUT_MS,
        );
      } catch (err) {
        failure = classifyFetchError(err);
      }
      if (failure === undefined && languages) {
        await this.repo.saveSuccess(workspaceId, row.id, languages, at);
        next = {
          ...row,
          languages,
          languagesFetchedAt: at,
          languagesAttemptedAt: at,
          languagesFailure: null,
        };
      } else {
        const reason = failure ?? 'unreachable';
        await this.repo.saveFailure(workspaceId, row.id, reason, at);
        next = { ...row, languagesFailure: reason, languagesAttemptedAt: at };
      }
    } catch {
      // Persistence failed: fall through with the in-memory state; still no throw.
    }
    const stack = deriveStack(next) ?? UNREACHABLE;
    await this.logFetch(workspaceId, row, before, stack, next);
    return { row: next, stack };
  }

  /** NFR-11: one info line per completed fetch. Only enum values and counts — no tokens, no raw errors. */
  private async logFetch(
    workspaceId: string,
    row: RepoRow,
    before: RepoStack | null,
    stack: RepoStack,
    next: RepoRow,
  ): Promise<void> {
    const entry: Record<string, unknown> = {
      full_name: row.fullName,
      outcome: stack.status,
      ...(stack.reason ? { reason: stack.reason } : {}),
    };
    try {
      const agents: AgentRow[] = await this.container.agentsRepo.list(workspaceId);
      const d = diffCompatible(
        agents,
        { stack: before, exact: codeLanguagesExact(row.languages) },
        { stack, exact: codeLanguagesExact(next.languages) },
      );
      if (d.became_compatible) entry.became_compatible = d.became_compatible;
      if (d.became_incompatible) entry.became_incompatible = d.became_incompatible;
    } catch {
      // diff counts are best-effort
    }
    this.log.info(entry, 'repo language fetch completed');
  }
}
