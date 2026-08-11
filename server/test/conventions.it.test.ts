import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * `tsconfig.json` doubles as both a probed config file AND the evidence
 * source, so the fixture doesn't need repo-intel indexing (`file_rank`) at
 * all — `getConventionSamples` naturally returns `[]` for an unindexed repo,
 * which is realistic for a freshly-added repo and keeps this test Docker-only
 * (no extra indexing pipeline setup).
 */
const TSCONFIG_CONTENT = ['{', '  "compilerOptions": {', '    "strict": true', '  }', '}', ''].join(
  '\n',
);

const EXTRACTION_FIXTURE = {
  candidates: [
    {
      category: 'structure',
      rule: 'Strict TypeScript mode is enabled.',
      evidence_path: 'tsconfig.json',
      evidence_line_start: 3,
      evidence_line_end: 3,
      confidence: 0.9,
    },
  ],
};

const EMPTY_EXTRACTION_FIXTURE = { candidates: [] };

let repoSeq = 0;

d('conventions module (Testcontainers pg)', () => {
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

  async function setupRepo() {
    const name = `conv-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  function appWith(structured: unknown, git = new MockGitClient({ files: { 'tsconfig.json': TSCONFIG_CONTENT } })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git,
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: structured } }) },
      },
    });
  }

  async function setupPr(repoId: string, number: number, headSha: string) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number,
        title: `PR #${number}`,
        author: 'octocat',
        branch: `feat/pr-${number}`,
        base: 'main',
        headSha,
      })
      .returning();
    return pr!;
  }

  it('GET before any scan reports scanned_at: null and an empty list', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const repo = await setupRepo();

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      candidates: [],
      scan: { repo_id: repo.id, sample_file_count: 0, candidate_count: 0, scanned_at: null, pull_number: null },
    });
    await app.close();
  });

  it('extract samples the config file, verifies evidence, and defaults new candidates to accepted', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const repo = await setupRepo();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.scan).toMatchObject({ repo_id: repo.id, sample_file_count: 1, candidate_count: 1 });
    expect(body.scan.scanned_at).not.toBeNull();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      category: 'structure',
      rule: 'Strict TypeScript mode is enabled.',
      evidence_path: 'tsconfig.json',
      evidence_line_start: 3,
      evidence_line_end: 3,
      evidence_snippet: '    "strict": true',
      accepted: true,
    });
    await app.close();
  });

  it('drops a candidate whose cited line does not exist in the real file (bad evidence)', async () => {
    const badFixture = {
      candidates: [
        {
          category: 'other',
          rule: 'A hallucinated rule.',
          evidence_path: 'tsconfig.json',
          evidence_line_start: 999,
          evidence_line_end: 999,
          confidence: 0.5,
        },
      ],
    };
    const app = await appWith(badFixture);
    const repo = await setupRepo();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates).toEqual([]);
    expect(body.scan.candidate_count).toBe(0);
    await app.close();
  });

  it('PUT /conventions/:id toggles accepted and edits the rule text', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const repo = await setupRepo();
    const extracted = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })
    ).json();
    const id = extracted.candidates[0].id as string;

    const rejected = await app.inject({
      method: 'PUT',
      url: `/conventions/${id}`,
      payload: { accepted: false },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().accepted).toBe(false);

    const edited = await app.inject({
      method: 'PUT',
      url: `/conventions/${id}`,
      payload: { rule: 'Edited rule text.' },
    });
    expect(edited.json().rule).toBe('Edited rule text.');
    await app.close();
  });

  it('PUT /conventions/:id 404s for an unknown id', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const res = await app.inject({
      method: 'PUT',
      url: `/conventions/00000000-0000-0000-0000-000000000000`,
      payload: { accepted: false },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('re-scan keeps accepted candidates untouched and replaces rejected/pending ones', async () => {
    const twoCandidateFixture = {
      candidates: [
        ...EXTRACTION_FIXTURE.candidates,
        {
          category: 'error-handling',
          rule: 'Strict compiler options are required.',
          evidence_path: 'tsconfig.json',
          evidence_line_start: 2,
          evidence_line_end: 2,
          confidence: 0.6,
        },
      ],
    };
    const app = await appWith(twoCandidateFixture);
    const repo = await setupRepo();

    const first = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })
    ).json();
    expect(first.candidates).toHaveLength(2);
    const keptId = first.candidates.find(
      (c: { rule: string }) => c.rule === 'Strict TypeScript mode is enabled.',
    ).id as string;
    const rejectedId = first.candidates.find(
      (c: { rule: string }) => c.rule === 'Strict compiler options are required.',
    ).id as string;

    // The user rejects one of the two, leaving the other accepted (the default).
    await app.inject({
      method: 'PUT',
      url: `/conventions/${rejectedId}`,
      payload: { accepted: false },
    });

    // Re-scan with a fixture that finds nothing new.
    const app2 = await appWith(EMPTY_EXTRACTION_FIXTURE);
    const rescanned = await app2.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
    });
    expect(rescanned.statusCode).toBe(200);
    const body = rescanned.json();

    // The still-accepted candidate survives untouched; the rejected one — no
    // longer proposed by this scan — is gone rather than lingering rejected.
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].id).toBe(keptId);
    expect(body.candidates[0].accepted).toBe(true);
    await app.close();
    await app2.close();
  });

  it('extract with pull_number reads samples from the PR head, not the default branch', async () => {
    const headSha = 'pr-head-sha-1';
    const git = new MockGitClient({
      files: { 'tsconfig.json': TSCONFIG_CONTENT },
      filesAtRef: {
        [headSha]: {
          'tsconfig.json': ['{', '  "compilerOptions": {', '    "noImplicitAny": true', '  }', '}', ''].join('\n'),
        },
      },
    });
    const prFixture = {
      candidates: [
        {
          category: 'structure',
          rule: 'noImplicitAny is enabled on this branch.',
          evidence_path: 'tsconfig.json',
          evidence_line_start: 3,
          evidence_line_end: 3,
          confidence: 0.8,
        },
      ],
    };
    const app = await appWith(prFixture, git);
    const repo = await setupRepo();
    await setupPr(repo.id, 482, headSha);

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
      payload: { pull_number: 482 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(git.fetchedPullHeads).toContainEqual({ repo: { owner: 'acme', name: repo.name }, n: 482 });
    expect(body.scan.pull_number).toBe(482);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      rule: 'noImplicitAny is enabled on this branch.',
      evidence_snippet: '    "noImplicitAny": true',
    });
    await app.close();
  });

  it('extract 404s for an unknown pull_number', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const repo = await setupRepo();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
      payload: { pull_number: 9999 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('extract 404s for an unknown repo', async () => {
    const app = await appWith(EXTRACTION_FIXTURE);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/00000000-0000-0000-0000-000000000000/conventions/extract`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
