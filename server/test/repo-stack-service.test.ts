import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { RepoStackService } from '../src/modules/repo-stack/service.js';
import type { RepoStackRepository } from '../src/modules/repo-stack/repository.js';
import type { Container } from '../src/platform/container.js';
import { ConfigError } from '../src/platform/errors.js';

type Row = {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  languages: Record<string, number> | null;
  languagesFetchedAt: Date | null;
  languagesAttemptedAt: Date | null;
  languagesFailure: string | null;
};

const TOKEN = 'ghp_SECRET_TOKEN_123';

function setup(opts: { row?: Partial<Row>; gh?: MockGitHubClient | 'no_token'; agents?: unknown[] } = {}) {
  const row: Row = {
    id: 'r1',
    workspaceId: 'ws',
    owner: 'acme',
    name: 'app',
    fullName: 'acme/app',
    languages: null,
    languagesFetchedAt: null,
    languagesAttemptedAt: null,
    languagesFailure: null,
    ...opts.row,
  };
  const states = new Map<string, boolean>();
  const repo = {
    getRepo: async (ws: string, id: string) => (ws === row.workspaceId && id === row.id ? { ...row } : undefined),
    saveSuccess: async (_w: string, _r: string, languages: Record<string, number>, at: Date) => {
      Object.assign(row, { languages, languagesFetchedAt: at, languagesAttemptedAt: at, languagesFailure: null });
    },
    saveFailure: async (_w: string, _r: string, reason: string, at: Date) => {
      Object.assign(row, { languagesFailure: reason, languagesAttemptedAt: at });
    },
    listStates: async () => [...states].map(([agentId, active]) => ({ repoId: 'r1', agentId, active })),
    upsertState: async (_r: string, a: string, active: boolean) => void states.set(a, active),
  } as unknown as RepoStackRepository;
  const gh = opts.gh ?? new MockGitHubClient({ languages: { Python: 900, TypeScript: 100 } });
  const agents = opts.agents ?? [
    { id: 'py', workspaceId: 'ws', languages: ['Python'] },
    { id: 'go', workspaceId: 'ws', languages: ['Go'] },
  ];
  const container = {
    db: {},
    github: async () => {
      if (gh === 'no_token') throw new ConfigError('GITHUB_TOKEN is not configured');
      return gh;
    },
    agentsRepo: {
      list: async () => agents,
      getById: async (ws: string, id: string) =>
        ws === 'ws' ? (agents as { id: string }[]).find((a) => a.id === id) : undefined,
    },
  } as unknown as Container;
  const logs: Record<string, unknown>[] = [];
  const svc = new RepoStackService(container, repo, undefined, { info: (o) => void logs.push(o) });
  return { svc, row, gh, states, logs };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('RepoStackService.ensure', () => {
  it('fetches once when never attempted and stores the map (AC-3)', async () => {
    const { svc, row, gh } = setup();
    const s = await svc.ensure('ws', 'r1');
    expect(s.status).toBe('known');
    expect(s.languages.map((l) => l.name)).toEqual(['Python', 'TypeScript']);
    expect((gh as MockGitHubClient).getLanguagesCalls).toBe(1);
    expect(row.languagesFailure).toBeNull();
  });

  it('makes zero GitHub calls with a stored breakdown (NFR-2)', async () => {
    const t = new Date();
    const { svc, gh } = setup({ row: { languages: { Python: 1 }, languagesAttemptedAt: t, languagesFetchedAt: t } });
    await svc.ensure('ws', 'r1');
    await svc.evaluate('ws', 'r1');
    expect((gh as MockGitHubClient).getLanguagesCalls).toBe(0);
  });

  it('shares one in-flight fetch between concurrent callers (NFR-3)', async () => {
    const { svc, gh } = setup();
    const [a, b] = await Promise.all([svc.ensure('ws', 'r1'), svc.ensure('ws', 'r1', { force: true })]);
    expect(a).toEqual(b);
    expect((gh as MockGitHubClient).getLanguagesCalls).toBe(1);
  });

  it('a never-resolving fetch becomes unreachable at 5 s (NFR-1, AC-7)', async () => {
    const gh = new MockGitHubClient();
    gh.getLanguages = () => new Promise(() => {});
    const { svc } = setup({ gh });
    const p = svc.ensure('ws', 'r1');
    await vi.advanceTimersByTimeAsync(4_999);
    let done = false;
    void p.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ status: 'unknown', reason: 'unreachable' });
  });

  it('maps no token / 403 / 404 / 500 (AC-5/6/7) and never throws (NFR-4)', async () => {
    expect(await setup({ gh: 'no_token' }).svc.ensure('ws', 'r1')).toMatchObject({ reason: 'no_token' });
    for (const [status, reason] of [[403, 'no_access'], [404, 'no_access'], [500, 'unreachable']] as const) {
      const gh = new MockGitHubClient({ languagesError: { status } });
      expect(await setup({ gh }).svc.ensure('ws', 'r1')).toMatchObject({ status: 'unknown', reason });
    }
  });

  it('unknown: cooldown 1 min no refetch, 10 min refetch (AC-44)', async () => {
    const gh = new MockGitHubClient({ languagesError: { status: 500 } });
    const { svc } = setup({ gh });
    await svc.ensure('ws', 'r1');
    await vi.advanceTimersByTimeAsync(60_000);
    await svc.ensure('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    await svc.ensure('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(2);
  });

  it('force bypasses the cooldown (AC-29)', async () => {
    const gh = new MockGitHubClient({ languagesError: { status: 500 } });
    const { svc } = setup({ gh });
    await svc.ensure('ws', 'r1');
    await svc.ensure('ws', 'r1', { force: true });
    expect(gh.getLanguagesCalls).toBe(2);
  });

  it('success with no code languages replaces a known map → unknown, not stale (AC-8)', async () => {
    const t = new Date();
    const gh = new MockGitHubClient({ languages: {} });
    const { svc } = setup({ gh, row: { languages: { Python: 5 }, languagesAttemptedAt: t, languagesFetchedAt: t } });
    const s = await svc.ensure('ws', 'r1', { force: true });
    expect(s).toMatchObject({ status: 'unknown', reason: 'no_code_languages', languages: [] });
  });

  it('failure on a known repo keeps the map → stale with reason (AC-9)', async () => {
    const t = new Date();
    const gh = new MockGitHubClient({ languagesError: { status: 403 } });
    const { svc, row } = setup({ gh, row: { languages: { Python: 5 }, languagesAttemptedAt: t, languagesFetchedAt: t } });
    const s = await svc.ensure('ws', 'r1', { force: true });
    expect(s).toMatchObject({ status: 'stale', reason: 'no_access' });
    expect(s.languages.map((l) => l.name)).toEqual(['Python']);
    expect(row.languages).toEqual({ Python: 5 });
  });

  it('404s on a foreign workspace repo (NFR-7)', async () => {
    const { svc } = setup();
    await expect(svc.ensure('other', 'r1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('logs one line per fetch with compat counts and never the token / raw error (NFR-6/11)', async () => {
    const gh = new MockGitHubClient({ languages: { Python: 100 } });
    const { svc, logs } = setup({ gh });
    await svc.ensure('ws', 'r1');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ full_name: 'acme/app', outcome: 'known', became_incompatible: 1 });
    expect(logs[0]).not.toHaveProperty('reason');

    const bad = setup({ gh: new MockGitHubClient({ languagesError: new Error(`bad credentials ${TOKEN}`) }) });
    const s = await bad.svc.ensure('ws', 'r1');
    expect(JSON.stringify([s, bad.logs, bad.row])).not.toContain(TOKEN);
    expect(bad.logs[0]).toMatchObject({ outcome: 'unknown', reason: 'unreachable' });
  });
});

describe('RepoStackService.evaluate / setActive', () => {
  it('evaluate fetches, then lists compatibility with opt-in active (AC-3/18a)', async () => {
    const { svc } = setup();
    const { stack, entries } = await svc.evaluate('ws', 'r1');
    expect(stack.status).toBe('known');
    expect(entries.map((e) => [e.agent.id, e.compatible, e.active])).toEqual([
      ['py', true, false],
      ['go', false, false],
    ]);
  });

  it('setActive adds/removes per repo and restores state after incompatibility (AC-18/42)', async () => {
    const { svc, row, states } = setup();
    expect(await svc.setActive('ws', 'py', 'r1', true)).toMatchObject({ active: true, compatible: true });
    expect(states.get('py')).toBe(true);
    // stack becomes Go-only: py hidden but stored state kept; then back
    Object.assign(row, { languages: { Go: 10 }, languagesAttemptedAt: new Date(), languagesFetchedAt: new Date() });
    let ev = await svc.evaluate('ws', 'r1');
    expect(ev.entries.find((e) => e.agent.id === 'py')).toMatchObject({ compatible: false, active: true });
    Object.assign(row, { languages: { Python: 10 } });
    ev = await svc.evaluate('ws', 'r1');
    expect(ev.entries.find((e) => e.agent.id === 'py')).toMatchObject({ compatible: true, active: true });
    expect(await svc.setActive('ws', 'py', 'r1', false)).toMatchObject({ active: false });
  });

  it('activating an incompatible agent → 409 agent_incompatible with details; removing is allowed', async () => {
    const { svc } = setup();
    await expect(svc.setActive('ws', 'go', 'r1', true)).rejects.toMatchObject({
      code: 'agent_incompatible',
      statusCode: 409,
      details: { agent_languages: ['Go'], repo_languages: ['Python', 'TypeScript'] },
    });
    expect(await svc.setActive('ws', 'go', 'r1', false)).toMatchObject({ active: false });
  });

  it('409 repo_languages omits sub-threshold languages', async () => {
    const { svc } = setup({
      gh: new MockGitHubClient({ languages: { Python: 950, Go: 50 } }),
      agents: [{ id: 'go', workspaceId: 'ws', name: 'Go', languages: ['Go'] }],
    });
    await expect(svc.setActive('ws', 'go', 'r1', true)).rejects.toMatchObject({
      details: { agent_languages: ['Go'], repo_languages: ['Python'] },
    });
  });

  it('missing repo 404s before any GitHub fetch', async () => {
    const { svc, gh } = setup();
    await expect(svc.setActive('ws', 'py', 'nope', true)).rejects.toMatchObject({ statusCode: 404 });
    expect((gh as MockGitHubClient).getLanguagesCalls).toBe(0);
  });

  it('malformed GitHub payload is rejected at the adapter; a thrown fetch -> unreachable', async () => {
    const { svc } = setup({ gh: new MockGitHubClient({ languagesError: new Error('bad payload') }) });
    expect((await svc.ensure('ws', 'r1')).reason).toBe('unreachable');
  });

  it('404s for a foreign agent or repo (NFR-7)', async () => {
    const { svc } = setup();
    await expect(svc.setActive('other', 'py', 'r1', true)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.setActive('ws', 'nope', 'r1', true)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('unknown stack: every agent is compatible (AC-16)', async () => {
    const { svc } = setup({ gh: new MockGitHubClient({ languagesError: { status: 500 } }) });
    const { entries } = await svc.evaluate('ws', 'r1');
    expect(entries.every((e) => e.compatible)).toBe(true);
  });
});

describe('RepoStackService.afterPollSuccess (AC-43)', () => {
  it('forces a fetch when unknown, even inside the cooldown', async () => {
    const gh = new MockGitHubClient({ languagesError: { status: 500 } });
    const { svc } = setup({ gh });
    await svc.ensure('ws', 'r1');
    await svc.afterPollSuccess('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(2);
  });
  it('does nothing when the stack is known', async () => {
    const t = new Date();
    const { svc, gh } = setup({ row: { languages: { Python: 1 }, languagesAttemptedAt: t, languagesFetchedAt: t } });
    await svc.afterPollSuccess('ws', 'r1');
    expect((gh as MockGitHubClient).getLanguagesCalls).toBe(0);
  });
  it('never throws', async () => {
    const { svc } = setup();
    await expect(svc.afterPollSuccess('other', 'r1')).resolves.toBeUndefined();
  });
  it('resolves when the fetch rejects', async () => {
    const { svc } = setup({ gh: new MockGitHubClient({ languagesError: new Error('boom') }) });
    await expect(svc.afterPollSuccess('ws', 'r1')).resolves.toBeUndefined();
  });
  it('resolves when getRepo rejects', async () => {
    const { svc } = setup();
    (svc as any).repo.getRepo = async () => {
      throw new Error('db down');
    };
    await expect(svc.afterPollSuccess('ws', 'r1')).resolves.toBeUndefined();
  });
  it('resolves when the DB write rejects', async () => {
    const { svc } = setup();
    (svc as any).repo.saveSuccess = async () => {
      throw new Error('write failed');
    };
    await expect(svc.afterPollSuccess('ws', 'r1')).resolves.toBeUndefined();
  });
});

describe('AC-44 cooldown boundary (fake clock)', () => {
  it('no refetch at 10 min minus 1 ms, refetch at exactly 10 min, then a new 10 min window', async () => {
    const gh = new MockGitHubClient({ languagesError: { status: 500 } });
    const { svc } = setup({ gh });
    await svc.ensure('ws', 'r1');
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
    await svc.ensure('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await svc.ensure('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(2);
    // the failed retry restarts the window
    await vi.advanceTimersByTimeAsync(60_000);
    await svc.ensure('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(2);
  });

  it('evaluate() (list path) honours the same cooldown: two calls 1 min apart -> one call', async () => {
    const gh = new MockGitHubClient({ languagesError: { status: 500 } });
    const { svc } = setup({ gh });
    await svc.evaluate('ws', 'r1');
    await vi.advanceTimersByTimeAsync(60_000);
    await svc.evaluate('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(1);
  });
});

describe('NFR-11 log fields / NFR-6 token hygiene', () => {
  it('logs became_compatible and became_incompatible counts when a refresh flips the set', async () => {
    const t = new Date();
    const gh = new MockGitHubClient({ languages: { Python: 100 } });
    const { svc, logs } = setup({ gh, row: { languages: { Go: 100 }, languagesAttemptedAt: t, languagesFetchedAt: t } });
    await svc.ensure('ws', 'r1', { force: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      full_name: 'acme/app',
      outcome: 'known',
      became_compatible: 1, // py
      became_incompatible: 1, // go
    });
  });

  it('logs outcome stale + reason for a failed refresh of a known repo; no counts when nothing changed', async () => {
    const t = new Date();
    const gh = new MockGitHubClient({ languagesError: { status: 403 } });
    const { svc, logs } = setup({ gh, row: { languages: { Python: 5 }, languagesAttemptedAt: t, languagesFetchedAt: t } });
    await svc.ensure('ws', 'r1', { force: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ full_name: 'acme/app', outcome: 'stale', reason: 'no_access' });
    expect(logs[0]).not.toHaveProperty('became_compatible');
    expect(logs[0]).not.toHaveProperty('became_incompatible');
  });

  it('every failure mode: token never in result, logs or stored row; reason is in the enum', async () => {
    const ENUM = ['no_token', 'no_access', 'unreachable', 'no_code_languages'];
    const errs: unknown[] = [
      { status: 403, message: `Bad credentials ${TOKEN}` },
      { status: 404, message: `Not Found ${TOKEN}` },
      { status: 500, message: `Authorization: token ${TOKEN}` },
      new Error(`fetch failed ${TOKEN}`),
    ];
    for (const e of errs) {
      const s = setup({ gh: new MockGitHubClient({ languagesError: e as never }) });
      const stack = await s.svc.ensure('ws', 'r1');
      expect(ENUM).toContain(stack.reason);
      expect(JSON.stringify([stack, s.logs, s.row])).not.toContain(TOKEN);
    }
    const nt = setup({ gh: 'no_token' });
    const stack = await nt.svc.ensure('ws', 'r1');
    expect(stack.reason).toBe('no_token');
    expect(JSON.stringify([stack, nt.logs, nt.row])).not.toContain('GITHUB_TOKEN is not configured');
  });
});
