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
  console.warn('[stats] Docker not available — skipping integration tests.');
}

const DAY_MS = 24 * 60 * 60 * 1000;

function minimalTrace(agentName: string, skillsUsed: string[]): RunTrace {
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

d('agent stats aggregation', () => {
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

  it('aggregates runs/cost/accept-rate/severity/category/skills correctly', async () => {
    const { db } = pg.handle;

    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Stats Target',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'x',
      })
      .returning();
    const agentId = agent!.id;

    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'stats-test-skill',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'stats-repo', fullName: 'acme/stats-repo' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900,
        title: 'Stats PR',
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
    async function makeRun(daysAgo: number, costUsd: number, durationMs: number, findingsCount: number) {
      const [run] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId,
          prId: pr!.id,
          ranAt: new Date(now - daysAgo * DAY_MS),
          provider: 'openai',
          model: 'gpt-4.1',
          durationMs,
          tokensIn: 100,
          tokensOut: 100,
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
      return { run: run!, review: review! };
    }

    // Run 1 (5d ago, within 30d): 2 findings — one accepted CRITICAL/security, one dismissed WARNING/bug.
    const r1 = await makeRun(5, 0.02, 3000, 2);
    await db.insert(t.findings).values([
      {
        reviewId: r1.review.id,
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
        reviewId: r1.review.id,
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
    await db.insert(t.runTraces).values({ runId: r1.run.id, trace: minimalTrace(agent!.name, [skill!.id]) });

    // Run 2 (10d ago, within 30d): 1 pending SUGGESTION/style finding.
    const r2 = await makeRun(10, 0.04, 5000, 1);
    await db.insert(t.findings).values([
      {
        reviewId: r2.review.id,
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
    await db.insert(t.runTraces).values({ runId: r2.run.id, trace: minimalTrace(agent!.name, [skill!.id]) });

    // Run 3 (40d ago, in the 30-60d "prior" window, NOT in the 30d window):
    // 1 WARNING/perf finding — must NOT count toward the 30d KPIs, but its
    // cost DOES feed the prior-period cost-delta comparison.
    const r3 = await makeRun(40, 0.1, 8000, 1);
    await db.insert(t.findings).values([
      {
        reviewId: r3.review.id,
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
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();

    // 30d KPIs: only runs 1+2 count.
    expect(stats.runs).toBe(2);
    expect(stats.findings_total).toBe(3);
    expect(stats.avg_cost_usd).toBeCloseTo(0.03, 5);
    // prior-30d (day 31-60) avg cost is run 3's 0.10 alone; delta = 0.03 - 0.10.
    expect(stats.avg_cost_usd_delta).toBeCloseTo(-0.07, 5);
    expect(stats.avg_latency_ms).toBeCloseTo(4000, 5);

    // Accept rate: decided-only (1 accepted / (1 accepted + 1 dismissed) = 0.5);
    // the pending SUGGESTION from run 2 must NOT be counted as a rejection.
    expect(stats.accepted).toBe(1);
    expect(stats.dismissed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.accept_rate).toBeCloseTo(0.5, 5);

    expect(stats.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });

    // Category cost: run1's 0.02 split across 2 findings ($0.01 each) →
    // security gets $0.01, bug gets $0.01; run2's 0.04 / 1 finding → style $0.04.
    const byCategory = Object.fromEntries(
      stats.findings_by_category.map((c: { category: string; cost_usd: number }) => [c.category, c.cost_usd]),
    );
    expect(byCategory.security).toBeCloseTo(0.01, 5);
    expect(byCategory.bug).toBeCloseTo(0.01, 5);
    expect(byCategory.style).toBeCloseTo(0.04, 5);
    expect(byCategory.perf).toBeUndefined(); // run 3 is outside the 30d category window

    // Most-used skills: the one skill appears in both 30d traces → 100%.
    expect(stats.most_used_skills).toHaveLength(1);
    expect(stats.most_used_skills[0]).toMatchObject({ skill_id: skill!.id, name: 'stats-test-skill', pct: 100 });

    // Run history is NOT window-limited — all 3 runs show up.
    expect(stats.run_history).toHaveLength(3);
    expect(stats.run_history[0]).toMatchObject({ pr_number: 900 });

    await app.close();
  });

  it('404s for an unknown agent', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/agents/00000000-0000-0000-0000-000000000000/stats',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
