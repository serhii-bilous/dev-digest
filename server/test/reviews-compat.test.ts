import { describe, it, expect, vi } from 'vitest';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RepoStackService } from '../src/modules/repo-stack/service.js';
import type { RepoStackRepository } from '../src/modules/repo-stack/repository.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { Container } from '../src/platform/container.js';
import { AppError } from '../src/platform/errors.js';

const agent = (id: string, languages: string[] | null) =>
  ({ id, workspaceId: 'ws', name: id, provider: 'openai', model: 'm', languages }) as any;
const AGENTS = [agent('py', ['Python']), agent('ts', ['TypeScript']), agent('any', null), agent('off', ['Python'])];

function setup(gh: MockGitHubClient, row0: Record<string, unknown> = {}, active = ['py', 'ts', 'any']) {
  const row: Record<string, any> = {
    id: 'r1', workspaceId: 'ws', owner: 'a', name: 'b', fullName: 'a/b',
    languages: null, languagesFetchedAt: null, languagesAttemptedAt: null, languagesFailure: null,
    ...row0,
  };
  const stackRepo = {
    getRepo: async () => ({ ...row }),
    saveSuccess: async (_w: string, _r: string, languages: Record<string, number>, at: Date) =>
      void Object.assign(row, { languages, languagesFetchedAt: at, languagesAttemptedAt: at, languagesFailure: null }),
    saveFailure: async (_w: string, _r: string, reason: string, at: Date) =>
      void Object.assign(row, { languagesFailure: reason, languagesAttemptedAt: at }),
    listStates: async () => active.map((agentId) => ({ repoId: 'r1', agentId, active: true })),
    upsertState: async () => undefined,
  } as unknown as RepoStackRepository;
  const llm = new MockLLMProvider('openai', {});
  const container = {
    db: {},
    github: async () => gh,
    agentsRepo: { list: async () => AGENTS },
    llm: async () => llm,
  } as unknown as Container;
  (container as any).repoStack = new RepoStackService(container, stackRepo);
  const svc = new ReviewService(container);
  const createAgentRun = vi.fn().mockResolvedValue('run-x');
  (svc as any).repo = {
    getPull: async () => ({ id: 'pr1', repoId: 'r1', number: 1 }),
    getRepo: async () => ({ id: 'r1' }),
    createAgentRun,
  };
  const executeRuns = vi.fn().mockResolvedValue(undefined);
  (svc as any).executor = { executeRuns };
  return { svc, createAgentRun, executeRuns, llm, row };
}

const names = (t: { id: string }[]) => t.map((a) => a.id).sort();

describe('ReviewService.resolveTargets — stack gating', () => {
  it('fresh repo (no languages) with {all:true} runs nothing', async () => {
    const { svc, createAgentRun, executeRuns } = setup(new MockGitHubClient({ languages: {} }), {}, []);
    const { targets, stack } = await svc.resolveTargets('ws', 'pr1', { all: true });
    expect(targets).toEqual([]);
    const out = await svc.runReview('ws', 'pr1', targets, stack);
    expect(out.runs).toEqual([]);
    expect(createAgentRun).not.toHaveBeenCalled();
    void executeRuns;
  });

  it('Python repo + all runs only active Python/any agents', async () => {
    const { svc } = setup(new MockGitHubClient({ languages: { Python: 1000 } }));
    const { targets } = await svc.resolveTargets('ws', 'pr1', { all: true });
    expect(names(targets)).toEqual(['any', 'py']);
  });

  it('unknown -> known Python hides TS agents from all', async () => {
    const gh = new MockGitHubClient({ languages: { Python: 1000 } });
    const { svc, row } = setup(gh, { languagesAttemptedAt: new Date(), languagesFailure: 'unreachable' });
    // unknown: TS agent is compatible
    expect(names((await svc.resolveTargets('ws', 'pr1', { all: true })).targets)).toContain('ts');
    row.languagesAttemptedAt = null; // allow a fetch
    row.languagesFailure = null;
    const { targets } = await svc.resolveTargets('ws', 'pr1', { all: true });
    expect(names(targets)).not.toContain('ts');
  });

  it('incompatible single agent -> 409 with details and zero createAgentRun calls', async () => {
    const { svc, createAgentRun } = setup(new MockGitHubClient({ languages: { Python: 1000 } }));
    const err = (await svc.resolveTargets('ws', 'pr1', { agentId: 'ts' }).catch((e) => e)) as AppError;
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('agent_incompatible');
    expect(err.details).toEqual({ agent_languages: ['TypeScript'], repo_languages: ['Python'] });
    expect(createAgentRun).not.toHaveBeenCalled();
  });

  it('409 repo_languages omits sub-threshold languages', async () => {
    const { svc } = setup(new MockGitHubClient({ languages: { Python: 950, TypeScript: 50 } }));
    const err = (await svc.resolveTargets('ws', 'pr1', { agentId: 'ts' }).catch((e) => e)) as AppError;
    expect(err.details).toEqual({ agent_languages: ['TypeScript'], repo_languages: ['Python'] });
  });

  it('a single inactive but compatible agent still runs; missing agent is 404', async () => {
    const { svc } = setup(new MockGitHubClient({ languages: { Python: 1000 } }));
    const { targets } = await svc.resolveTargets('ws', 'pr1', { agentId: 'off' });
    expect(names(targets)).toEqual(['off']);
    const err = (await svc.resolveTargets('ws', 'pr1', { agentId: 'nope' }).catch((e) => e)) as AppError;
    expect(err.statusCode).toBe(404);
  });

  it('a failing languages stub never throws; LLM calls untouched; snapshot reaches executeRuns', async () => {
    const { svc, executeRuns, llm } = setup(new MockGitHubClient({ languagesError: new Error('x') }));
    const { targets, stack } = await svc.resolveTargets('ws', 'pr1', { all: true });
    expect(stack.status).toBe('unknown');
    await svc.runReview('ws', 'pr1', targets, stack);
    expect(executeRuns.mock.calls[0]![5]).toBe(stack);
    expect(llm.calls).toHaveLength(0);
  });
});
