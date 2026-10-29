import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { RepoStackService } from '../src/modules/repo-stack/service.js';
import type { RepoStackRepository } from '../src/modules/repo-stack/repository.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { Container } from '../src/platform/container.js';

/**
 * Hermetic: real app + real error handler via app.inject (no DB; body
 * validation rejects before any handler / DB access).
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT_ID = '11111111-1111-4111-8111-111111111111';

describe('AC-14: invalid languages on PUT /agents/:id -> 422 validation_error', () => {
  it.each([
    ['empty list', []],
    ['more than 20 names', Array.from({ length: 21 }, (_, i) => `L${i}`)],
    ['a name longer than 50 chars', ['x'.repeat(51)]],
  ])('%s', async (_label, languages) => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'PUT', url: `/agents/${AGENT_ID}`, payload: { languages } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('POST /agents with invalid languages is also 422 validation_error', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'a', provider: 'openai', model: 'm', system_prompt: 'p', languages: [] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});

describe('AC-35: incompatible single-agent run -> 409 in the app error envelope', () => {
  it('real ReviewService error serialised by the real handler; no run created', async () => {
    const row: Record<string, unknown> = {
      id: 'r1', workspaceId: 'ws', owner: 'a', name: 'b', fullName: 'a/b',
      languages: { Python: 1000 }, languagesFetchedAt: new Date(), languagesAttemptedAt: new Date(), languagesFailure: null,
    };
    const stackRepo = {
      getRepo: async () => ({ ...row }),
      saveSuccess: async () => undefined,
      saveFailure: async () => undefined,
      listStates: async () => [],
      upsertState: async () => undefined,
    } as unknown as RepoStackRepository;
    const tsAgent = { id: 'ts', workspaceId: 'ws', name: 'ts', provider: 'openai', model: 'm', languages: ['TypeScript'] };
    const container = {
      db: {},
      github: async () => new MockGitHubClient({ languages: { Python: 1000 } }),
      agentsRepo: { list: async () => [tsAgent], getById: async () => tsAgent },
    } as unknown as Container;
    (container as any).repoStack = new RepoStackService(container, stackRepo);
    const svc = new ReviewService(container);
    const createAgentRun = vi.fn();
    (svc as any).repo = { getPull: async () => ({ id: 'pr1', repoId: 'r1', number: 1 }), createAgentRun };

    const app = await buildApp({ config });
    app.post('/__test/review', async () => svc.resolveTargets('ws', 'pr1', { agentId: 'ts' }));
    const res = await app.inject({ method: 'POST', url: '/__test/review' });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('agent_incompatible');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.details).toEqual({ agent_languages: ['TypeScript'], repo_languages: ['Python'] });
    expect(createAgentRun).not.toHaveBeenCalled();
    await app.close();
  });
});
