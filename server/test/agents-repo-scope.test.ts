import { describe, expect, it } from 'vitest';
import { CreateAgentBody, UpdateAgentBody } from '../src/modules/agents/routes.js';
import { AgentsService, toStoredLanguages } from '../src/modules/agents/service.js';
import { buildVersionConfig, isConfigChange, toAgentDto } from '../src/modules/agents/helpers.js';
import { AppError, NotFoundError } from '../src/platform/errors.js';
import type { AgentRow } from '../src/modules/agents/repository.js';
import type { Container } from '../src/platform/container.js';

const base = { name: 'a', provider: 'openai', model: 'm', system_prompt: 'p' };

function row(id: string, languages: string[] | null = null, ws = 'ws1'): AgentRow {
  return {
    id, workspaceId: ws, name: id, description: '', provider: 'openai', model: 'm',
    systemPrompt: 'p', outputSchema: null, strategy: 'single-pass', ciFailOn: 'critical',
    repoIntel: true, contextPaths: [], languages, version: 1,
  } as unknown as AgentRow;
}

/** Fake RepoStackService: state per (repo, agent), languages re-read on each evaluate. */
function fakeContainer(agents: AgentRow[], repoLangs: Record<string, string[]>, wsRepos: Record<string, string>) {
  const active = new Set<string>();
  const stack = {
    async evaluate(ws: string, repoId: string) {
      if (wsRepos[repoId] !== ws) throw new NotFoundError('Repo not found');
      const langs = repoLangs[repoId] ?? [];
      return {
        stack: {},
        entries: agents
          .filter((a) => a.workspaceId === ws)
          .map((a) => ({
            agent: a,
            compatible: a.languages == null || a.languages.some((l) => langs.includes(l)),
            active: active.has(`${repoId}:${a.id}`),
          })),
      };
    },
    async setActive(ws: string, agentId: string, repoId: string, on: boolean) {
      const { entries } = await stack.evaluate(ws, repoId);
      const e = entries.find((x) => x.agent.id === agentId);
      if (!e) throw new NotFoundError('Agent not found');
      if (on && !e.compatible) throw new AppError('agent_incompatible', 'x', 409, {});
      if (on) active.add(`${repoId}:${agentId}`);
      else active.delete(`${repoId}:${agentId}`);
      return { ...e, active: on };
    },
  };
  return { repoStack: stack } as unknown as Container;
}

describe('languages body schema (AC-14)', () => {
  it('accepts any / 1..20 names', () => {
    expect(CreateAgentBody.safeParse({ ...base, languages: 'any' }).success).toBe(true);
    expect(CreateAgentBody.safeParse({ ...base, languages: ['ts'] }).success).toBe(true);
    expect(CreateAgentBody.safeParse(base).success).toBe(true);
  });
  it.each([[[]], [Array(21).fill('x')], [['']], [['x'.repeat(51)]], ['ts']])('rejects %j', (l) => {
    expect(CreateAgentBody.safeParse({ ...base, languages: l }).success).toBe(false);
    expect(UpdateAgentBody.safeParse({ languages: l }).success).toBe(false);
  });
  it('stores any as NULL', () => {
    expect(toStoredLanguages('any')).toBeNull();
    expect(toStoredLanguages(['ts'])).toEqual(['ts']);
  });
});

describe('versioning', () => {
  it('a languages change bumps the version; a reorder / same value does not', () => {
    const ex = row('a', ['ts', 'py']);
    expect(isConfigChange(ex, { languages: ['go'] })).toBe(true);
    expect(isConfigChange(ex, { languages: null })).toBe(true);
    expect(isConfigChange(ex, { languages: ['py', 'ts'] })).toBe(false);
    expect(isConfigChange(row('b'), { languages: null })).toBe(false);
  });
  it('snapshot includes languages', () => {
    expect(buildVersionConfig(row('a', ['ts']), []).languages).toEqual(['ts']);
    expect(buildVersionConfig(row('a'), []).languages).toBe('any');
  });
  it('dto without languages is any', () => {
    expect(toAgentDto(row('a')).languages).toBe('any');
  });
});

describe('repo-scoped reads and Add/Remove', () => {
  const a = row('agent-any');
  const ts = row('agent-ts', ['typescript']);
  const py = row('agent-py', ['python']);
  const mk = () => {
    const svc = new AgentsService(
      fakeContainer([a, ts, py], { repoA: ['typescript'], repoB: ['typescript'] }, { repoA: 'ws1', repoB: 'ws1' }),
    );
    // getForRepo checks agent existence before evaluating; stub the DB read.
    (svc as any).repo = { getById: async (_ws: string, id: string) => [a, ts, py].find((x) => x.id === id) };
    return svc;
  };

  it('lists only compatible agents, new ones inactive', async () => {
    const list = await mk().listForRepo('ws1', 'repoA');
    expect(list.map((x) => x.id).sort()).toEqual(['agent-any', 'agent-ts']);
    expect(list.every((x) => x.active === false && x.compatible)).toBe(true);
  });

  it('get returns an incompatible agent with compatible:false', async () => {
    const e = await mk().getForRepo('ws1', 'repoA', 'agent-py');
    expect(e.compatible).toBe(false);
  });

  it('Add on repo A does not touch repo B', async () => {
    const s = mk();
    const r = await s.setActive('ws1', 'agent-ts', 'repoA', true);
    expect(r.active).toBe(true);
    expect((await s.getForRepo('ws1', 'repoA', 'agent-ts')).active).toBe(true);
    expect((await s.getForRepo('ws1', 'repoB', 'agent-ts')).active).toBe(false);
    await s.setActive('ws1', 'agent-ts', 'repoA', false);
    expect((await s.getForRepo('ws1', 'repoA', 'agent-ts')).active).toBe(false);
  });

  it('activating an incompatible agent is 409 agent_incompatible', async () => {
    await expect(mk().setActive('ws1', 'agent-py', 'repoA', true)).rejects.toMatchObject({
      code: 'agent_incompatible',
      statusCode: 409,
    });
  });

  it('foreign workspace is 404', async () => {
    await expect(mk().listForRepo('ws2', 'repoA')).rejects.toBeInstanceOf(NotFoundError);
    await expect(mk().setActive('ws2', 'agent-ts', 'repoA', true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a languages change shows on the next evaluation, no refresh', async () => {
    const agents = [row('x', ['python'])];
    const s = new AgentsService(fakeContainer(agents, { repoA: ['typescript'] }, { repoA: 'ws1' }));
    expect(await s.listForRepo('ws1', 'repoA')).toHaveLength(0);
    agents[0] = row('x', ['typescript']);
    expect(await s.listForRepo('ws1', 'repoA')).toHaveLength(1);
  });
});
