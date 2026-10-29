import { AppError } from './errors.js';
import type { RepoLanguage, RepoStack, RepoStackReason } from '@devdigest/shared';

/**
 * Pure stack-compatibility rules (domain layer — no framework, DB or I/O).
 * Lives in `platform/` because agents, repos, reviews and repo-stack all need
 * it and `no-cross-module-internals` stops one module importing another's helpers.
 */

/** Languages GitHub reports that are not "code" for compatibility purposes (AC-4). Lower-cased. */
export const NON_CODE_LANGUAGES: ReadonlySet<string> = new Set(
  [
    'Dockerfile',
    'Shell',
    'Makefile',
    'HTML',
    'CSS',
    'SCSS',
    'Batchfile',
    'PowerShell',
    'Procfile',
    'Jupyter Notebook',
  ].map((s) => s.toLowerCase()),
);

/** A language must make up at least this share (%) of the code to count (AC-15). */
export const COMPATIBILITY_THRESHOLD_PERCENT = 10;

export interface StackColumns {
  languages: Record<string, number> | null;
  languagesFetchedAt: Date | null;
  languagesAttemptedAt: Date | null;
  languagesFailure: string | null;
}

/** Code languages with UNROUNDED percent of the remaining code total, highest first. */
export function codeLanguagesExact(map: Record<string, number> | null | undefined): RepoLanguage[] {
  const entries = Object.entries(map ?? {}).filter(
    ([name, bytes]) =>
      !NON_CODE_LANGUAGES.has(name.toLowerCase()) && Number.isFinite(bytes) && bytes > 0,
  );
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total <= 0) return [];
  return entries
    .map(([name, bytes]) => ({ name, bytes, percent: (bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
}

/** DTO form of `codeLanguagesExact`: percent rounded to one decimal. */
export function codeLanguages(map: Record<string, number> | null | undefined): RepoLanguage[] {
  return codeLanguagesExact(map).map((l) => ({ ...l, percent: Math.round(l.percent * 10) / 10 }));
}

const FAILURE_REASONS: ReadonlySet<string> = new Set(['no_token', 'no_access', 'unreachable']);

/**
 * Derive the stack from the stored columns. `null` = never attempted (and nothing stored).
 *  - failure + code languages kept → stale (reason = failure)
 *  - failure + nothing usable      → unknown (reason = failure)
 *  - success + code languages      → known
 *  - success + none                → unknown / no_code_languages
 */
export function deriveStack(row: StackColumns): RepoStack | null {
  if (!row.languagesAttemptedAt && !row.languages) return null;
  const code = codeLanguages(row.languages);
  const base = {
    languages: code,
    ...(row.languagesFetchedAt ? { fetched_at: row.languagesFetchedAt.toISOString() } : {}),
    ...(row.languagesAttemptedAt ? { last_attempt_at: row.languagesAttemptedAt.toISOString() } : {}),
  };
  const failure =
    row.languagesFailure && FAILURE_REASONS.has(row.languagesFailure)
      ? (row.languagesFailure as RepoStackReason)
      : undefined;
  if (failure) {
    return { status: code.length ? 'stale' : 'unknown', reason: failure, ...base };
  }
  if (code.length) return { status: 'known', ...base };
  return { status: 'unknown', reason: 'no_code_languages', ...base };
}

/**
 * Is an agent declaration compatible with a stack? `decl` is the stored column
 * (`null`/`'any'` = any). `unknown` or no stack at all → always compatible (AC-16).
 * `exact` must be the unrounded breakdown (threshold is evaluated on raw values).
 */
export function isCompatible(
  decl: readonly string[] | 'any' | null | undefined,
  stack: Pick<RepoStack, 'status'> | null,
  exact: readonly RepoLanguage[],
): boolean {
  if (decl == null || decl === 'any') return true;
  if (!stack || stack.status === 'unknown') return true;
  const wanted = new Set(decl.map((d) => d.toLowerCase()));
  return exact.some(
    (l) => l.percent >= COMPATIBILITY_THRESHOLD_PERCENT && wanted.has(l.name.toLowerCase()),
  );
}

export interface AgentLike {
  id: string;
  languages: string[] | null;
}
export interface StateLike {
  agentId: string;
  active: boolean;
}
export interface ResolvedEntry<A extends AgentLike> {
  agent: A;
  compatible: boolean;
  active: boolean;
}

/**
 * Per-agent compatibility + activation. `active` is the STORED value (restored
 * as-is once compatible again — AC-40/42) and `false` when no row exists
 * (opt-in — AC-18a/41). Nothing is ever written by this function.
 */
export function resolveEntries<A extends AgentLike>(
  agents: readonly A[],
  states: readonly StateLike[],
  stack: Pick<RepoStack, 'status'> | null,
  exact: readonly RepoLanguage[],
): ResolvedEntry<A>[] {
  const byAgent = new Map(states.map((s) => [s.agentId, s.active]));
  return agents.map((agent) => ({
    agent,
    compatible: isCompatible(agent.languages, stack, exact),
    active: byAgent.get(agent.id) ?? false,
  }));
}

/** Counts of agents whose compatibility flipped between two breakdowns (NFR-11 log). */
export function diffCompatible(
  agents: readonly AgentLike[],
  before: { stack: Pick<RepoStack, 'status'> | null; exact: readonly RepoLanguage[] },
  after: { stack: Pick<RepoStack, 'status'> | null; exact: readonly RepoLanguage[] },
): { became_compatible: number; became_incompatible: number } {
  let became_compatible = 0;
  let became_incompatible = 0;
  for (const a of agents) {
    const was = isCompatible(a.languages, before.stack, before.exact);
    const now = isCompatible(a.languages, after.stack, after.exact);
    if (!was && now) became_compatible++;
    if (was && !now) became_incompatible++;
  }
  return { became_compatible, became_incompatible };
}

/**
 * 409 for an agent that does not fit the repo. `repo_languages` lists only the
 * languages at/above the threshold (exact, unrounded percent), so a sub-threshold
 * language never shows on both sides of the mismatch.
 */
export function incompatibleError(
  agentName: string,
  agentLanguages: readonly string[] | null | undefined,
  exact: readonly RepoLanguage[],
): AppError {
  return new AppError(
    'agent_incompatible',
    `Agent "${agentName}" does not match this repository's languages`,
    409,
    {
      agent_languages: [...(agentLanguages ?? [])],
      repo_languages: exact
        .filter((l) => l.percent >= COMPATIBILITY_THRESHOLD_PERCENT)
        .map((l) => l.name),
    },
  );
}

function isRateLimited(err: unknown): boolean {
  const e = err as {
    response?: { headers?: Record<string, unknown>; data?: { documentation_url?: unknown } };
    message?: unknown;
  };
  if (String(e?.response?.headers?.['x-ratelimit-remaining']) === '0') return true;
  const doc = e?.response?.data?.documentation_url;
  const text = `${typeof e?.message === 'string' ? e.message : ''} ${typeof doc === 'string' ? doc : ''}`;
  return /rate.?limit/i.test(text);
}

/**
 * Map a thrown fetch error to the closed reason enum. Never exposes or logs the message.
 * AC-6: only 403/404 → no_access; AC-7: any other non-2xx (incl. 401) → unreachable.
 * A rate-limited 403 is transient, so it is unreachable too.
 */
export function classifyFetchError(err: unknown): Exclude<RepoStackReason, 'no_code_languages'> {
  if ((err as { code?: unknown })?.code === 'config_error') return 'no_token';
  const status =
    (err as { status?: unknown })?.status ?? (err as { statusCode?: unknown })?.statusCode;
  if (status === 403 && isRateLimited(err)) return 'unreachable';
  if (status === 403 || status === 404) return 'no_access';
  return 'unreachable';
}
