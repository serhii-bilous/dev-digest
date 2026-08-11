import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integration] Docker not available — skipping Testcontainers integration tests.',
  );
}

d('Testcontainers: pg + pgvector', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('migrations applied: every table exists', async () => {
    const rows = await pg.handle.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema = 'public'`;
    // 35 domain tables + drizzle migration bookkeeping
    expect(rows[0]!.count).toBeGreaterThanOrEqual(35);
  });

  it('pgvector extension is enabled', async () => {
    const rows = await pg.handle.sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    expect(rows).toHaveLength(1);
  });

  it('vector insert + similarity query round-trips', async () => {
    const { db } = pg.handle;
    const { workspaceId } = await seed(db);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'v', name: 'vec', fullName: 'v/vec' })
      .returning();
    const vec = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    await db.insert(t.codeChunks).values({
      workspaceId,
      repoId: repo!.id,
      path: 'a.ts',
      content: 'hello',
      embedding: vec,
      source: 'code',
    });
    // cosine distance query against the same vector → distance ~0
    const literal = `[${vec.join(',')}]`;
    const rows = await pg.handle.sql<{ dist: number }[]>`
      SELECT embedding <=> ${literal}::vector AS dist
      FROM code_chunks WHERE repo_id = ${repo!.id}`;
    expect(rows[0]!.dist).toBeLessThan(0.0001);
  });

  it('seed is idempotent (re-run does not duplicate workspace)', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);
    const ws = await pg.handle.db.select().from(t.workspaces);
    expect(ws.filter((w) => w.name === 'default')).toHaveLength(1);
  });
});

d('Testcontainers: DB-backed routes via app.inject', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('POST /repos persists + enqueues a clone (mock git) and GET /repos lists it', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const git = new MockGitClient();
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git, github: new MockGitHubClient() },
    });

    const create = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/acme/widgets' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().full_name).toBe('acme/widgets');

    await app.container.jobs.onIdle();
    expect(git.cloned.some((c) => c.repo.name === 'widgets')).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/repos' });
    expect(list.json().some((r: { full_name: string }) => r.full_name === 'acme/widgets')).toBe(
      true,
    );
    await app.close();
  });

  it('GET /repos/:id/pulls imports PRs (mock GitHub) idempotently', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repos = await app.inject({ method: 'GET', url: '/repos' });
    const repoId = repos.json()[0]!.id;

    const first = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(first.statusCode).toBe(200);
    expect(first.json().length).toBeGreaterThan(0);
    // import again → still idempotent (unique repo_id+number)
    const second = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(second.json().length).toBe(first.json().length);
    await app.close();
  });

  it('GET /repos/:id/pulls reports findings from the latest review only, not every review', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repos = await app.inject({ method: 'GET', url: '/repos' });
    const repoId = repos.json()[0]!.id;
    const repoRow = repos.json()[0]!;

    // A fresh PR (not the seed's pre-reviewed #482) so it starts with no review.
    const [prRow] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: repoRow.workspace_id,
        repoId,
        number: 9001,
        title: 'Findings-aggregate fixture PR',
        author: 'test',
        branch: 'test/findings-agg',
        base: 'main',
        headSha: 'f00dbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const pulls: { id: string; findings: unknown }[] = before.json();
    const pr = pulls.find((p) => p.id === prRow!.id)!;
    expect(pr).toBeDefined();
    // No review yet — findings is null, not zeroed counts.
    expect(pr.findings ?? null).toBeNull();

    const [olderReview] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId: prRow!.workspaceId,
        prId: pr.id,
        kind: 'review',
        score: 40,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: olderReview!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'stale finding',
        rationale: 'r',
        confidence: 0.9,
      },
    ]);

    const [latestReview] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId: prRow!.workspaceId,
        prId: pr.id,
        kind: 'review',
        score: 70,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: latestReview!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'bug',
        title: 'current finding 1',
        rationale: 'r',
        confidence: 0.8,
      },
      {
        reviewId: latestReview!.id,
        file: 'a.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'bug',
        title: 'current finding 2',
        rationale: 'r',
        confidence: 0.8,
      },
      {
        reviewId: latestReview!.id,
        file: 'a.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'current finding 3',
        rationale: 'r',
        confidence: 0.6,
      },
    ]);

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const updated = after
      .json()
      .find((p: { id: string }) => p.id === pr.id) as {
      findings: { CRITICAL: number; WARNING: number; SUGGESTION: number };
    };
    // Only the latest review's findings are counted — the older CRITICAL is excluded.
    expect(updated.findings).toEqual({ CRITICAL: 0, WARNING: 2, SUGGESTION: 1 });
    await app.close();
  });

  it('GET /repos/:id/pulls aggregates a multi-agent run instead of picking whichever agent finished last', async () => {
    // Regression test: a single "run review" click fans out into one
    // `reviews` row per active agent, created moments apart in
    // non-deterministic completion order. A clean Security/Performance pass
    // that happens to insert last must not hide a General reviewer's real
    // findings from the same run.
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repos = await app.inject({ method: 'GET', url: '/repos' });
    const repoId = repos.json()[0]!.id;
    const repoRow = repos.json()[0]!;

    const [prRow] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: repoRow.workspace_id,
        repoId,
        number: 9002,
        title: 'Multi-agent-batch fixture PR',
        author: 'test',
        branch: 'test/multi-agent-batch',
        base: 'main',
        headSha: 'f00dbeef2',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    // General reviewer finishes first, finds a real issue.
    const [generalReview] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId: prRow!.workspaceId,
        prId: prRow!.id,
        kind: 'review',
        score: 53,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: generalReview!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'bug',
        title: 'real issue',
        rationale: 'r',
        confidence: 0.8,
      },
    ]);

    // Security + Performance reviewers finish moments later, clean — but
    // still same run/batch as the General reviewer above.
    await pg.handle.db.insert(t.reviews).values([
      {
        workspaceId: prRow!.workspaceId,
        prId: prRow!.id,
        kind: 'review',
        score: 100,
        createdAt: new Date('2026-03-01T00:00:03.000Z'),
      },
      {
        workspaceId: prRow!.workspaceId,
        prId: prRow!.id,
        kind: 'review',
        score: 100,
        createdAt: new Date('2026-03-01T00:00:05.000Z'),
      },
    ]);

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    const updated = after
      .json()
      .find((p: { id: string }) => p.id === prRow!.id) as {
      score: number | null;
      findings: { CRITICAL: number; WARNING: number; SUGGESTION: number };
    };
    // The batch's worst score wins, and the General reviewer's finding is
    // NOT masked by the clean Security/Performance passes finishing last.
    expect(updated.score).toBe(53);
    expect(updated.findings).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    await app.close();
  });

  it('POST /repos/:id/poll syncs PR list and does NOT trigger a review', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const repoId = (await app.inject({ method: 'GET', url: '/repos' })).json()[0]!.id;
    const poll = await app.inject({ method: 'POST', url: `/repos/${repoId}/poll` });
    expect(poll.json().reviewTriggered).toBe(false);
    expect(poll.json().synced).toBeGreaterThan(0);
    await app.close();
  });
});
