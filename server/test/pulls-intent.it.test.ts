/**
 * PR intent classification — POST/GET /pulls/:id/intent.
 *
 * `IntentClassifier` reads the pull + repo via `ReviewRepository` (a class with
 * a private `db` constructor param — TypeScript's structural typing brands it,
 * so a hermetic duck-typed stub can't satisfy the type without an unsafe cast).
 * Per `../TESTING.md`'s "one real integration per data-backed workflow", this
 * is a single Testcontainers-backed integration file, following the exact
 * `startPg`/`buildApp`/`seed` template used by `reviews.it.test.ts` and
 * `pulls-comments.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitHubClient, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Intent } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A single-file, single-hunk diff. `throttleWindowMs` is the distinctive
 * ADDED line content that must NEVER reach the classifier's prompt — only its
 * hunk header (`@@ -20,3 +20,4 @@`) may.
 */
const DIFF = `diff --git a/src/limiter.ts b/src/limiter.ts
--- a/src/limiter.ts
+++ b/src/limiter.ts
@@ -20,3 +20,4 @@
   const bucket = new Map();
+  const throttleWindowMs = 100;
   return bucket;`;

const INTENT_1: Intent = {
  summary: 'Adds per-route rate limiting for public API endpoints.',
  in_scope: ['Add a token-bucket limiter middleware', 'Wire the limiter into public routes'],
  out_of_scope: ['Auth changes', 'Client-side retry logic'],
};

const INTENT_2: Intent = {
  summary: 'Recomputed: tightens the limiter thresholds.',
  in_scope: ['Lower the default rate limit'],
  out_of_scope: ['New endpoints'],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { body?: string } = {},
) {
  const name = `intent-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 55,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: opts.body ?? 'Add rate limiting.',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('PR intent classification (Testcontainers pg)', () => {
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

  it('GET /pulls/:id/intent returns null before any compute', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: DIFF }) },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();

    await app.close();
  });

  it('POST computes intent from title/body/linked-issue/hunk-headers, never raw diff content', async () => {
    // review_intent's registry default is openrouter/deepseek-v4-flash — the
    // override is keyed by that provider id, not the mock's own internal id.
    const llm = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_1 } });
    const github = new MockGitHubClient();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github,
        llm: { openrouter: llm },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Closes #55. Adds a token-bucket limiter.',
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary).toBe(INTENT_1.summary);
    expect(body.in_scope).toEqual(INTENT_1.in_scope);
    expect(body.out_of_scope).toEqual(INTENT_1.out_of_scope);

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call).toBeDefined();
    const req = call!.req as { messages: { role: string; content: string }[] };
    const allContent = req.messages.map((m) => m.content).join('\n');

    // Linked issue (#55, resolved via the mock's default getIssue fixture).
    expect(allContent).toContain('Issue #55');
    expect(allContent).toContain('mock issue');
    // Hunk header only — never the added/removed diff line content.
    expect(allContent).toContain('@@ -20,3 +20,4 @@');
    expect(allContent).not.toContain('throttleWindowMs');

    await app.close();
  });

  it('degrades gracefully with no GitHub adapter available (no throw, no linked-issue content)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_1 } });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        // No `github` override AND no GITHUB_TOKEN secret → container.github()
        // throws ConfigError internally, caught by the classifier's degrade path.
        secrets: new MockSecretsProvider({}),
        llm: { openrouter: llm },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Closes #55. Adds a limiter.',
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary).toBe(INTENT_1.summary);

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call).toBeDefined();
    const req = call!.req as { messages: { role: string; content: string }[] };
    const allContent = req.messages.map((m) => m.content).join('\n');
    expect(allContent).not.toContain('Linked issue');
    expect(allContent).not.toContain('Issue #55');
    // Still classifies from title/body/hunks alone.
    expect(allContent).toContain('@@ -20,3 +20,4 @@');

    await app.close();
  });

  it('GET after POST returns the persisted record with call metadata', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_1 } });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary).toBe(INTENT_1.summary);
    expect(body.in_scope).toEqual(INTENT_1.in_scope);
    expect(body.out_of_scope).toEqual(INTENT_1.out_of_scope);
    expect(body.provider).toBe('openrouter');
    expect(body.model).toBe('deepseek/deepseek-v4-flash');
    expect(body.tokens_in).toBe(100);
    expect(body.tokens_out).toBe(50);
    expect(body.cost_usd).toBe(0.001);
    expect(body.computed_at).toBeTruthy();

    await app.close();
  });

  it('a second POST overwrites (upsert) — one row per PR, second fixture wins', async () => {
    const llm1 = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_1 } });
    const app1 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm1 },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await app1.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    await app1.close();

    const llm2 = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_2 } });
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm2 },
      },
    });
    const res = await app2.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toBe(INTENT_2.summary);

    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe(INTENT_2.summary);
    expect(rows[0]!.inScope).toEqual(INTENT_2.in_scope);

    await app2.close();
  });

  // Mutates the (shared, workspace-wide) feature-model settings — run last so
  // it doesn't affect earlier tests that rely on the openrouter registry default.
  it('respects a workspace feature-model override for review_intent', async () => {
    const settingsApp = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const put = await settingsApp.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'anthropic', model: 'claude-intent-mini' } } },
    });
    expect(put.statusCode).toBe(200);
    await settingsApp.close();

    const llmAnthropic = new MockLLMProvider('anthropic', { structuredBySchema: { Intent: INTENT_1 } });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { anthropic: llmAnthropic },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('anthropic');
    expect(body.model).toBe('claude-intent-mini');

    const call = llmAnthropic.calls.find((c) => c.method === 'completeStructured');
    expect((call!.req as { model: string }).model).toBe('claude-intent-mini');

    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(rows[0]!.provider).toBe('anthropic');
    expect(rows[0]!.model).toBe('claude-intent-mini');

    await app.close();
  });
});
