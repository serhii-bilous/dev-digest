import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { EvalsService } from './service.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { fakeSpawn, fixture, until, type FakeChild } from '../../adapters/llm/local/test-helpers.js';
import type { Review, SecretKey, SecretsProvider } from '@devdigest/shared';

/** Evals through Local on a stubbed CLI (AC-35, NFR-2). */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "FAKE_SECRET_FOR_TESTING_ONLY",
   redisUrl: x,`;
const REVIEW: Review = {
  verdict: 'request_changes', summary: 'Secret.', score: 40,
  findings: [{
    id: 'f1', severity: 'CRITICAL', category: 'security', title: 'Secret', file: 'src/config.ts',
    start_line: 11, end_line: 11, rationale: 'Committed.', confidence: 0.9, kind: 'finding',
  }],
};
const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: REVIEW, usage: { input_tokens: 10, output_tokens: 5 } });

d('evals through Local', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(token: string | null, script: (c: FakeChild, n: number) => void = (c) => c.finish(0, null, out)) {
    const store: Record<string, string> = token ? { LOCAL_CLAUDE_OAUTH_TOKEN: token } : {};
    const secrets: SecretsProvider = { get: async (k: SecretKey) => store[k as string], set: async () => undefined };
    const fs = fakeSpawn(script);
    const openai = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        secrets,
        llm: { openai },
        local: { exec: async () => ({ stdout: '2.1.311 (Claude Code)\n', exitCode: 0 }), spawn: fs.spawn },
      },
    });
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: { name: 'LocalEval', provider: 'local', model: 'haiku', system_prompt: 'review' } })
    ).json().id as string;
    const caseId = (
      await app.inject({
        method: 'POST', url: '/evals',
        payload: { owner_kind: 'agent', owner_id: agentId, name: 'c1', input_diff: DIFF, expected_output: [{ severity: 'CRITICAL', category: 'security' }] },
      })
    ).json().id as string;
    return { app, fs, openai, caseId };
  }

  it('records billing subscription and cost 0 for a Local eval (AC-35)', async () => {
    const { app, fs, openai, caseId } = await setup('tok-eval');
    const res = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result.billing).toBe('subscription');
    expect(body.result.cost_usd).toBe(0);
    expect(body.result.traces_passed).toBe(1);
    const [row] = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, body.run_id));
    expect(row).toMatchObject({ billing: 'subscription', costUsd: 0, pass: true });
    expect(fs.spawned).toHaveLength(1);
    expect(openai.calls).toHaveLength(0);
    await app.close();
  });

  it('Local unavailable: 2xx, failure recorded on the run, no spawn', async () => {
    const { app, fs, caseId } = await setup(null);
    const res = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    // NFR-8: never 5xx; the failure is recorded on the eval run (AC-27/35).
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toMatchObject({ billing: 'subscription', cost_usd: null, traces_passed: 0 });
    expect(body.result.per_trace[0].actual).toMatchObject({ failure_reason: 'token_missing' });
    expect(body.result.per_trace[0].actual.error.startsWith('token_missing: ')).toBe(true);
    expect(fs.spawned).toHaveLength(0);
    const rows = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, caseId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ billing: 'subscription', costUsd: null, pass: false });
    expect(rows[0]!.actualOutput).toMatchObject({ failure_reason: 'token_missing' });
    await app.close();
  });

  it('logs one line per Local call through the passed logger (NFR-10)', async () => {
    const { app, caseId } = await setup('tok-eval');
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const logger = { info: vi.fn() };
    await new EvalsService(app.container).runOne(ws!.id, caseId, logger);
    expect(logger.info).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logger.info.mock.calls[0]);
    expect(line).toContain('eval:');
    expect(line).not.toContain('tok-eval');
    await app.close();
  });

  const GARBAGE = '{"type":"result","subtype":"success","is_error":false,"result":"not json"}';
  const TOK = 'tok-eval-sentinel';
  it.each([
    ['auth_failed', (c: FakeChild) => c.finish(1, null, fixture('auth-failed.json'), `x ${TOK}`), 1, 'claude setup-token'],
    ['rate_limited', (c: FakeChild) => c.finish(1, null, fixture('session-limit.json')), 1, '3:45pm'],
    ['invalid_output', (c: FakeChild) => c.finish(0, null, GARBAGE), 3, undefined],
    ['cli_error', (c: FakeChild) => c.finish(1, null, '', `${TOK} ${'q'.repeat(2000)}`), 1, undefined],
  ])('AC-35 failure %s: 2xx, reason + billing recorded, no retry beyond the rule, token redacted, no API call', async (reason, script, spawns, contains) => {
    const { app, fs, openai, caseId } = await setup(TOK, script);
    const res = await app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toMatchObject({ billing: 'subscription', cost_usd: null, traces_passed: 0 });
    const actual = body.result.per_trace[0].actual;
    expect(actual.failure_reason).toBe(reason);
    expect(actual.error.startsWith(`${reason}: `)).toBe(true);
    expect(actual.error.slice(reason.length + 2).length).toBeLessThanOrEqual(500);
    if (contains) expect(actual.error).toContain(contains);
    expect(fs.spawned).toHaveLength(spawns);
    expect(openai.calls).toHaveLength(0);
    const rows = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, caseId));
    expect(rows[0]).toMatchObject({ billing: 'subscription', costUsd: null, pass: false });
    expect(JSON.stringify(rows) + res.body).not.toContain(TOK);
    await app.close();
  });

  it('AC-35 timeout: a never-ending Local eval call fails with timeout after 300 s', async () => {
    const { app, fs, caseId } = await setup('tok-eval', () => undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = app.inject({ method: 'POST', url: `/evals/${caseId}/run` });
      await until(() => fs.spawned.length === 1, 2000);
      await vi.advanceTimersByTimeAsync(300_001);
      const res = await pending;
      expect(res.statusCode).toBe(200);
      expect(res.json().result.per_trace[0].actual).toMatchObject({ failure_reason: 'timeout' });
      expect(fs.spawned[0]!.child.kills[0]).toBe('SIGTERM');
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it('AC-36 / AC-35: concurrent Local evals share the 2-slot cap', async () => {
    let live = 0;
    let max = 0;
    const { app, fs, caseId } = await setup('tok-eval', (c) => {
      live++;
      max = Math.max(max, live);
      setTimeout(() => { live--; c.finish(0, null, out); }, 30);
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => app.inject({ method: 'POST', url: `/evals/${caseId}/run` })),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(fs.spawned).toHaveLength(5);
    expect(max).toBe(2);
    await app.close();
  });
});
