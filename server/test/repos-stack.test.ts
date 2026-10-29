import { describe, it, expect, vi } from 'vitest';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { RepoStackService } from '../src/modules/repo-stack/service.js';
import type { RepoStackRepository } from '../src/modules/repo-stack/repository.js';
import { RepoService } from '../src/modules/repos/service.js';
import type { Container } from '../src/platform/container.js';

/** Hermetic: real RepoService + RepoStackService over in-memory repository stubs. */
function setup(gh: MockGitHubClient, preset: Record<string, unknown> = {}) {
  const row: Record<string, any> = {
    id: 'r1', workspaceId: 'ws', owner: 'acme', name: 'app', fullName: 'acme/app',
    defaultBranch: 'main', clonePath: null, lastPolledAt: null, createdBy: null,
    languages: null, languagesFetchedAt: null, languagesAttemptedAt: null, languagesFailure: null,
    ...preset,
  };
  const stackRepo = {
    getRepo: async (ws: string, id: string) => (ws === 'ws' && id === 'r1' ? { ...row } : undefined),
    saveSuccess: async (_w: string, _r: string, languages: Record<string, number>, at: Date) =>
      void Object.assign(row, { languages, languagesFetchedAt: at, languagesAttemptedAt: at, languagesFailure: null }),
    saveFailure: async (_w: string, _r: string, reason: string, at: Date) =>
      void Object.assign(row, { languagesFailure: reason, languagesAttemptedAt: at }),
    listStates: async () => [],
    upsertState: async () => undefined,
  } as unknown as RepoStackRepository;
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const container = {
    db: {},
    github: async () => gh,
    agentsRepo: { list: async () => [] },
    jobs: { enqueue },
  } as unknown as Container;
  (container as any).repoStack = new RepoStackService(container, stackRepo);
  const svc = new RepoService(container);
  (svc as any).repo = {
    findByFullName: async () => (preset.__existing ? { ...row } : undefined),
    insert: async () => ({ ...row }),
    getById: async (ws: string, id: string) => (ws === 'ws' && id === 'r1' ? { ...row } : undefined),
  };
  return { svc, row, enqueue, container };
}

describe('RepoService stack (add / refresh)', () => {
  it('add returns a known stack from the stubbed language map', async () => {
    const gh = new MockGitHubClient({ languages: { Python: 900, TypeScript: 100 } });
    const { svc } = setup(gh);
    const { repo, created } = await svc.add('ws', 'u', 'https://github.com/acme/app');
    expect(created).toBe(true);
    expect(repo.stack?.status).toBe('known');
    expect(repo.stack?.languages.map((l) => l.name)).toContain('Python');
  });

  it('add does not throw when the languages call fails', async () => {
    const gh = new MockGitHubClient({ languagesError: new Error('boom') });
    const { svc } = setup(gh);
    const { repo } = await svc.add('ws', 'u', 'https://github.com/acme/app');
    expect(repo.stack?.status).toBe('unknown');
  });

  it('refresh forces a fetch and returns a newer fetched_at', async () => {
    const old = new Date('2020-01-01T00:00:00Z');
    const gh = new MockGitHubClient({ languages: { Python: 100 } });
    const { svc } = setup(gh, { languages: { Python: 100 }, languagesFetchedAt: old, languagesAttemptedAt: old });
    const res = await svc.refresh('ws', 'r1');
    expect(res.status).toBe('refreshing');
    expect(res.stack.status).toBe('known');
    expect(new Date(res.stack.fetched_at!).getTime()).toBeGreaterThan(old.getTime());
    expect(gh.getLanguagesCalls).toBe(1);
  });

  it('refresh with a failing stub keeps the previous map (stale) and does not throw', async () => {
    const old = new Date('2020-01-01T00:00:00Z');
    const gh = new MockGitHubClient({ languagesError: new Error('down') });
    const { svc } = setup(gh, { languages: { Python: 100 }, languagesFetchedAt: old, languagesAttemptedAt: old });
    const res = await svc.refresh('ws', 'r1');
    expect(res.stack.status).toBe('stale');
  });

  it('an unknown repo + a successful poll triggers one languages call -> known', async () => {
    const gh = new MockGitHubClient({ languages: { Go: 500 } });
    const { container } = setup(gh);
    await container.repoStack.afterPollSuccess('ws', 'r1');
    expect(gh.getLanguagesCalls).toBe(1);
    expect((await container.repoStack.ensure('ws', 'r1')).status).toBe('known');
  });
});
