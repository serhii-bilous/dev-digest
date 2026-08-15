/**
 * Smart Diff — GET /pulls/:id/smart-diff.
 *
 * `ReviewService.smartDiffForPull` reads through `ReviewRepository`, so this
 * follows the same Testcontainers-backed `startPg`/`buildApp`/`seed` template
 * as `reviews.it.test.ts` and `pulls-intent.it.test.ts`. The classifier's own
 * pure-function rules are covered separately (hermetic) in
 * `smart-diff-classifier.test.ts` — this file only exercises the route +
 * persisted-data wiring, and the "no LLM call" acceptance criterion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse, type Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts
--- a/src/middleware/ratelimit.ts
+++ b/src/middleware/ratelimit.ts
@@ -24,3 +24,4 @@
   const key = bucketKey(req);
+  const count = await redis.incr(key);
   return count;`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Missing rate limit check.',
  score: 80,
  findings: [
    {
      id: 'f-1',
      severity: 'WARNING',
      category: 'bug',
      title: 'Rate limit not enforced before increment',
      file: 'src/middleware/ratelimit.ts',
      start_line: 25,
      end_line: 25,
      rationale: 'The count is read but never compared against a limit.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 3,
      deletions: 0,
      filesCount: 3,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();

  await db.insert(t.prFiles).values([
    {
      prId: pr!.id,
      path: 'src/middleware/ratelimit.ts',
      additions: 1,
      deletions: 0,
      patch: DIFF,
    },
    {
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  redisUrl: process.env.REDIS_URL,\n   stripeKey: x,',
    },
    {
      prId: pr!.id,
      path: 'pnpm-lock.yaml',
      additions: 40,
      deletions: 2,
      patch: '@@ -1,2 +1,2 @@\n-lockfileVersion: 5.4\n+lockfileVersion: 6.0',
    },
  ]);

  return { repo: repo!, pr: pr! };
}

d('Smart Diff (Testcontainers pg)', () => {
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

  function appWith(structured: unknown, llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  it('groups files into core/wiring/boilerplate and never calls the LLM', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(REVIEW_FIXTURE, llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // The route's own response schema is the contract itself — this parse
    // doubles as the round-trip assertion.
    const parsed = SmartDiffResponse.parse(body);

    const byRole = Object.fromEntries(parsed.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole.core).toContain('src/middleware/ratelimit.ts');
    expect(byRole.wiring).toContain('src/config.ts');
    expect(byRole.boilerplate).toContain('pnpm-lock.yaml');

    // Group order is always core -> wiring -> boilerplate.
    expect(parsed.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    // No LLM call happened just from reading the smart diff.
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('finding_lines picks up findings from a persisted review', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(REVIEW_FIXTURE, llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
    });
    const agent = created.json();

    await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // The review call above legitimately used the LLM — reset the recorded
    // calls before the smart-diff read we're actually asserting on.
    llm.calls.length = 0;

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const parsed = SmartDiffResponse.parse(res.json());

    const coreFile = parsed.groups.find((g) => g.role === 'core')!.files.find(
      (f) => f.path === 'src/middleware/ratelimit.ts',
    );
    expect(coreFile?.finding_lines).toEqual([25]);
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('404s for an unknown PR', async () => {
    const llm = new MockLLMProvider('openai', {});
    const app = await appWith({}, llm);

    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/smart-diff',
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
