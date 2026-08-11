import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skill-stats] Docker not available — skipping integration tests.');
}

const DAY_MS = 24 * 60 * 60 * 1000;

function trace(agentName: string, skillsUsed: string[]): RunTrace {
  return {
    config: { agent: agentName, model: 'gpt-4.1', provider: 'openai', source: 'local' },
    stats: { duration_ms: 100, tokens_in: 1, tokens_out: 1, cost_usd: 0, findings: 0, grounding: '0/0 passed' },
    prompt_assembly: { system: 'x', user: 'y' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    skills_used: skillsUsed,
    log: [],
  };
}

d('skill stats aggregation', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('computes agent_count/pull_rate/accept_rate/findings_by_category from runs where the skill was actually active', async () => {
    const { db } = pg.handle;

    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'shared-skill',
        description: 'x',
        type: 'security',
        source: 'manual',
        body: 'x',
      })
      .returning();
    const skillId = skill!.id;

    const [agentA] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'Agent A', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    const [agentB] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'Agent B', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    await db.insert(t.agentSkills).values([
      { agentId: agentA!.id, skillId, order: 0 },
      { agentId: agentB!.id, skillId, order: 0 },
    ]);

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skill-stats-repo', fullName: 'acme/skill-stats-repo' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 901,
        title: 'Skill stats PR',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const now = Date.now();
    async function makeRun(
      agentId: string,
      agentName: string,
      daysAgo: number,
      costUsd: number,
      findingsCount: number,
      skillsUsed: string[],
    ) {
      const [run] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId,
          prId: pr!.id,
          ranAt: new Date(now - daysAgo * DAY_MS),
          provider: 'openai',
          model: 'gpt-4.1',
          durationMs: 1000,
          tokensIn: 10,
          tokensOut: 10,
          costUsd,
          status: 'done',
          findingsCount,
          grounding: '1/1 passed',
        })
        .returning();
      const [review] = await db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: pr!.id,
          agentId,
          runId: run!.id,
          kind: 'review',
          verdict: 'comment',
          summary: 'x',
          score: 80,
          model: 'gpt-4.1',
        })
        .returning();
      await db.insert(t.runTraces).values({ runId: run!.id, trace: trace(agentName, skillsUsed) });
      return review!;
    }

    // Agent A, run 1 (5d ago): skill WAS active → pulled. 2 findings: 1 accepted, 1 dismissed.
    const r1 = await makeRun(agentA!.id, 'Agent A', 5, 0.02, 2, [skillId]);
    await db.insert(t.findings).values([
      {
        reviewId: r1.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 't1',
        rationale: 'x',
        confidence: 0.9,
        acceptedAt: new Date(),
      },
      {
        reviewId: r1.id,
        file: 'a.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'bug',
        title: 't2',
        rationale: 'x',
        confidence: 0.8,
        dismissedAt: new Date(),
      },
    ]);

    // Agent A, run 2 (10d ago): skill was NOT active that run (e.g. disabled at
    // the time) → must NOT count toward pull_rate's numerator or any finding stat.
    const r2 = await makeRun(agentA!.id, 'Agent A', 10, 0.03, 1, []);
    await db.insert(t.findings).values([
      {
        reviewId: r2.id,
        file: 'b.ts',
        startLine: 1,
        endLine: 1,
        severity: 'SUGGESTION',
        category: 'style',
        title: 't3',
        rationale: 'x',
        confidence: 0.5,
      },
    ]);

    // Agent B, run 3 (3d ago): skill WAS active → pulled. 1 pending finding.
    const r3 = await makeRun(agentB!.id, 'Agent B', 3, 0.04, 1, [skillId]);
    await db.insert(t.findings).values([
      {
        reviewId: r3.id,
        file: 'c.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'perf',
        title: 't4',
        rationale: 'x',
        confidence: 0.7,
      },
    ]);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();

    expect(stats.agent_count).toBe(2);
    expect(stats.agents.map((a: { agent_name: string }) => a.agent_name).sort()).toEqual([
      'Agent A',
      'Agent B',
    ]);

    // 3 linked-agent runs total (r1, r2, r3) in the 30d window; only r1 + r3
    // actually had the skill active → pull_rate = 2/3.
    expect(stats.pull_rate).toBeCloseTo(2 / 3, 5);

    // Findings only from pulled runs (r1 + r3): 1 accepted, 1 dismissed, 1 pending.
    expect(stats.findings_30d).toBe(3);
    expect(stats.accept_rate).toBeCloseTo(0.5, 5);

    const byCategory = Object.fromEntries(
      stats.findings_by_category.map((c: { category: string; cost_usd: number }) => [
        c.category,
        c.cost_usd,
      ]),
    );
    expect(byCategory.security).toBeCloseTo(0.01, 5);
    expect(byCategory.bug).toBeCloseTo(0.01, 5);
    expect(byCategory.perf).toBeCloseTo(0.04, 5);
    expect(byCategory.style).toBeUndefined(); // r2's finding — skill wasn't pulled there

    await app.close();
  });

  it('the same numbers are attached to the skill in GET /skills (list-card quick stats)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.statusCode).toBe(200);
    const list = res.json() as { name: string; agent_count?: number; pull_rate?: number | null }[];
    const shared = list.find((s) => s.name === 'shared-skill');
    expect(shared).toBeDefined();
    expect(shared!.agent_count).toBe(2);
    expect(shared!.pull_rate).toBeCloseTo(2 / 3, 5);
    await app.close();
  });

  it('404s for an unknown skill', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-0000-0000-000000000000/stats',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
