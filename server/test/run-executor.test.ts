import { describe, it, expect, vi } from 'vitest';
import type { Review } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository, PullRow } from '../src/modules/reviews/repository.js';
import type { AgentRow } from '../src/db/rows.js';
import type * as schema from '../src/db/schema.js';

/**
 * Hermetic unit test — no Postgres. `ReviewRunExecutor` is constructed
 * directly with a hand-built `Container`/`ReviewRepository` stand-in covering
 * only the surface `executeRuns`/`runOneAgent` actually touch (see
 * server/CLAUDE.md "Mock the outside world" + TESTING.md). `repoIntel: false`
 * on every queued agent skips the repo-intel-gated digest builders, keeping
 * the fake container small.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "FAKE_SECRET_FOR_TESTING_ONLY",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 95,
  findings: [],
};

function fakePull(): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'a1b2c3d4',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
  } as PullRow;
}

function fakeRepoRow(): typeof schema.repos.$inferSelect {
  return {
    id: 'repo-1',
    workspaceId: 'ws-1',
    owner: 'acme',
    name: 'payments-api',
    fullName: 'acme/payments-api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: new Date(),
  } as typeof schema.repos.$inferSelect;
}

function fakeAgent(id: string, name: string): AgentRow {
  return {
    id,
    workspaceId: 'ws-1',
    name,
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'You are a reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    // Skips the repo-intel-gated digest builders so the fake container
    // doesn't need a `repoIntel` facade.
    repoIntel: false,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
  } as AgentRow;
}

function buildFakeRepo(getIntent: ReturnType<typeof vi.fn>) {
  return {
    getIntent,
    insertReview: vi.fn().mockResolvedValue({ id: 'review-1' }),
    insertFindings: vi.fn().mockResolvedValue([]),
    markReviewed: vi.fn().mockResolvedValue(undefined),
    completeAgentRun: vi.fn().mockResolvedValue(undefined),
    saveRunTrace: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReviewRepository;
}

function buildFakeContainer(llm: MockLLMProvider, runBus: RunBus): Container {
  const agentsRepoStub = {
    enabledSkillsForPrompt: vi.fn().mockResolvedValue([]),
    linkedSkills: vi.fn().mockResolvedValue([]),
  };
  return {
    runBus,
    git: new MockGitClient({ diff: DIFF }),
    llm: async () => llm,
    agentsRepo: agentsRepoStub,
    tokenizer: { count: vi.fn().mockReturnValue(0) },
    // The persist step now runs inside `db.transaction()` (insertReview →
    // insertFindings → markReviewed as one unit of work) — the fake `repo`
    // above is a full mock that ignores the `tx` handle it's given, so this
    // only needs to invoke the callback, not simulate real transactionality.
    db: { transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
  } as unknown as Container;
}

describe('ReviewRunExecutor.executeRuns — intent digest hoisting', () => {
  it('loads the PR intent once per executeRuns() call, not once per queued agent', async () => {
    const getIntent = vi.fn().mockResolvedValue(undefined);
    const repo = buildFakeRepo(getIntent);
    const runBus = new RunBus();
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = buildFakeContainer(llm, runBus);
    const agentsRepo = container.agentsRepo;

    const executor = new ReviewRunExecutor(container, repo, agentsRepo);
    const jobs = [
      { agent: fakeAgent('agent-1', 'First Agent'), runId: 'run-1' },
      { agent: fakeAgent('agent-2', 'Second Agent'), runId: 'run-2' },
      { agent: fakeAgent('agent-3', 'Third Agent'), runId: 'run-3' },
    ];

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow(), jobs);

    expect(getIntent).toHaveBeenCalledTimes(1);
    // All three queued agents still completed (persisted a review each) —
    // the hoisted intent digest reached every run, it just wasn't refetched.
    expect(repo.insertReview).toHaveBeenCalledTimes(3);
  });
});
