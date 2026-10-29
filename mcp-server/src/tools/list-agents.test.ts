import { describe, expect, it } from 'vitest';
import { captureHandler, stubClient } from '../test-utils.js';
import { registerListAgentsTool } from './list-agents.js';

const REPO = { id: 'r1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' };
const AGENT = {
  id: 'a1',
  name: 'TS reviewer',
  description: 'd',
  provider: 'anthropic',
  model: 'm',
  languages: ['typescript'],
  active: true,
  extra: 'dropped',
};

describe('list_agents', () => {
  it('without repo calls GET /agents and omits active and enabled', async () => {
    const paths: string[] = [];
    const client = stubClient({
      get: async (path: string) => {
        paths.push(path);
        return [{ ...AGENT, enabled: true }];
      },
    });
    const handler = captureHandler<{ repo?: string }>(registerListAgentsTool, client);

    const result = await handler({});

    expect(paths).toEqual(['/agents']);
    const [a] = result.structuredContent.agents;
    expect(a).toEqual({
      id: 'a1',
      name: 'TS reviewer',
      description: 'd',
      provider: 'anthropic',
      model: 'm',
      languages: ['typescript'],
    });
    expect('active' in a).toBe(false);
    expect('enabled' in a).toBe(false);
  });

  it.each(['acme/payments-api', 'r1'])('with repo %s calls GET /agents?repo=<id> and includes active', async (repo) => {
    const paths: string[] = [];
    const client = stubClient({
      get: async (path: string) => {
        paths.push(path);
        if (path === '/repos') return [REPO];
        return [AGENT, { ...AGENT, id: 'a2', languages: 'any', active: false }];
      },
    });
    const handler = captureHandler<{ repo?: string }>(registerListAgentsTool, client);

    const result = await handler({ repo });

    expect(paths).toEqual(['/repos', '/agents?repo=r1']);
    expect(result.structuredContent.agents.map((a: { active: boolean }) => a.active)).toEqual([true, false]);
    expect(result.structuredContent.agents[1].languages).toBe('any');
  });

  it('returns isError for an unknown repo', async () => {
    const client = stubClient({ get: async () => [] });
    const handler = captureHandler<{ repo?: string }>(registerListAgentsTool, client);

    const result = await handler({ repo: 'nope/nope' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('owner/name');
  });
});
