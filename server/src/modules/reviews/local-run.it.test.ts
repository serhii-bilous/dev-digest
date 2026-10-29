import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { waitForPrRuns } from '../../../test/helpers/runs.js';
import { ReviewRunExecutor } from './run-executor.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockLLMProvider, MockGitClient, MockEmbedder } from '../../adapters/mocks.js';
import { FakeChild, fakeSpawn, fixture, type Spawned } from '../../adapters/llm/local/test-helpers.js';
import type { ExecFn } from '../../adapters/llm/local/index.js';
import type { Review, SecretKey, SecretsProvider } from '@devdigest/shared';

/**
 * Local (Claude Code CLI) review runs end to end on a stubbed CLI (spawn is
 * faked via ContainerOverrides.local; no real `claude`, no network).
 * Covers AC-19, 23-27, 31, 33, 36-38, 40, 41, 43, 47, NFR-2, NFR-3, NFR-8.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const TOKEN = 'sentinel-oauth-token-XYZ-987';
const cfg = (logLevel = 'silent') => loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: logLevel } as NodeJS.ProcessEnv);
const cliOk: ExecFn = async () => ({ stdout: '2.1.311 (Claude Code)\n', exitCode: 0 });
const cliGone: ExecFn = async () => ({ stdout: '', exitCode: null });

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "FAKE_SECRET_FOR_TESTING_ONLY",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret.',
  score: 42,
  findings: [
    {
      id: 'f-valid', severity: 'CRITICAL', category: 'security', title: 'Hardcoded secret',
      file: 'src/config.ts', start_line: 11, end_line: 11, rationale: 'Committed key.', confidence: 0.95, kind: 'finding',
    },
    {
      id: 'f-bad', severity: 'WARNING', category: 'bug', title: 'Phantom',
      file: 'src/config.ts', start_line: 999, end_line: 999, rationale: 'Not in diff.', confidence: 0.5, kind: 'finding',
    },
  ],
};
const successOut = (usage: unknown = { input_tokens: 120, output_tokens: 34 }) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: REVIEW, ...(usage ? { usage } : {}) });

function secretsWith(initial: Record<string, string>): SecretsProvider {
  const store = { ...initial };
  return { get: async (k: SecretKey) => store[k as string], set: async (k: SecretKey, v: string) => void (store[k as string] = v) };
}

/** Poll with real setImmediate so it also works while setTimeout is faked. */
async function eventually(cond: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('eventually: condition not met');
    await new Promise((r) => setImmediate(r));
  }
}

d('Local review runs (stubbed CLI)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(() => vi.useRealTimers());

  async function setupPr() {
    const db = pg.handle.db;
    const name = `local-api-${repoSeq++}`;
    const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 7, title: 'Add key', author: 'a', branch: 'feat/x', base: 'main',
        headSha: 'abc123', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review', body: 'body',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "FAKE_SECRET_FOR_TESTING_ONLY",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function mk(opts: {
    token?: string | null;
    exec?: ExecFn;
    script?: (c: FakeChild, n: number) => void;
    clock?: () => number;
    logLevel?: string;
  } = {}) {
    const fs = fakeSpawn(opts.script);
    const api = {
      openai: new MockLLMProvider('openai', { structured: REVIEW }),
      anthropic: new MockLLMProvider('anthropic', { structured: REVIEW }),
      openrouter: new MockLLMProvider('openai', { structured: REVIEW }),
    };
    const app = await buildApp({
      config: cfg(opts.logLevel),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        secrets: secretsWith(opts.token === null ? {} : { LOCAL_CLAUDE_OAUTH_TOKEN: opts.token ?? TOKEN }),
        llm: api,
        local: { exec: opts.exec ?? cliOk, spawn: fs.spawn, ...(opts.clock ? { clock: opts.clock } : {}) },
      },
    });
    const agent = async (provider = 'local', model = 'sonnet') => {
      const r = await app.inject({
        method: 'POST', url: '/agents',
        payload: { name: `A-${Math.random().toString(36).slice(2, 8)}`, provider, model, system_prompt: 'review' },
      });
      expect(r.statusCode).toBe(201);
      return r.json().id as string;
    };
    const start = (prId: string, agentId: string) =>
      app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    const runRow = async (runId: string) =>
      (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId)))[0]!;
    const trace = async (runId: string) => (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const reviewsOf = (runId: string) => pg.handle.db.select().from(t.reviews).where(eq(t.reviews.runId, runId));
    return { app, api, ...fs, agent, start, runRow, trace, reviewsOf };
  }

  const apiCalls = (api: Awaited<ReturnType<typeof mk>>['api']) =>
    api.openai.calls.length + api.anthropic.calls.length + api.openrouter.calls.length;

  it('success: grounded review persisted, cost 0, subscription, tokens, no API call, no token leak (AC-19, 40, 41, 43, 47, NFR-2, NFR-3)', async () => {
    const m = await mk({ script: (c) => c.finish(0, null, successOut()) });
    const pr = await setupPr();
    const res = await m.start(pr.id, await m.agent());
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const row = await m.runRow(runId);
    expect(row).toMatchObject({ status: 'done', billing: 'subscription', costUsd: 0, tokensIn: 120, tokensOut: 34, failureReason: null, findingsCount: 1 });
    // grounding dropped the bad citation (line 999) and kept the valid one
    expect(row.grounding).toBe('1/2 passed');
    expect(await m.reviewsOf(runId)).toHaveLength(1);

    const tr = await m.trace(runId);
    expect(tr.stats).toMatchObject({ billing: 'subscription', cost_usd: 0, tokens_in: 120, tokens_out: 34 });
    expect(typeof tr.stats.queued_ms).toBe('number');

    // run history exposes billing / reason / queued flag
    const runs = (await m.app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0]).toMatchObject({ run_id: runId, billing: 'subscription', queued_for_local: false });

    expect(apiCalls(m.api)).toBe(0);
    expect(JSON.stringify(row) + JSON.stringify(tr)).not.toContain(TOKEN);
    // the token went to the child env only, never the args
    expect(m.spawned[0]!.args.join(' ')).not.toContain(TOKEN);
    expect(m.spawned[0]!.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    // AC-20: all CLI tools and MCP servers disabled on a real review call
    const a = m.spawned[0]!.args;
    expect(a[a.indexOf('--tools') + 1]).toBe('');
    expect(a).toContain('--strict-mcp-config');
    expect(a).not.toContain('--mcp-config');
    expect(a).toContain('--no-session-persistence');
    // AC-47: trace records provider, model alias, billing, queued time
    expect(tr.config).toMatchObject({ provider: 'local', model: 'sonnet' });
    expect(tr.stats).toMatchObject({ billing: 'subscription' });
    await m.app.close();
  });

  it('NFR-3: with request logging ON, a sentinel token (and CLI stderr echo) never reaches the logs, DB, trace or responses; the NFR-10 line does (NFR-3, NFR-10)', async () => {
    const written: string[] = [];
    // pino (sonic-boom) writes straight to fd 1 via fs.write / fs.writeSync.
    const realWriteSync = fs.writeSync.bind(fs);
    const realWrite = fs.write.bind(fs);
    const capture = (fd: number, data: unknown) => {
      if (fd !== 1 && fd !== 2) return false;
      written.push(typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8'));
      return true;
    };
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) =>
      capture(fd, data) ? (data as string).length : (realWriteSync as (...a: unknown[]) => number)(fd, data, ...rest)) as typeof fs.writeSync);
    const spy2 = vi.spyOn(fs, 'write').mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) => {
      if (!capture(fd, data)) return (realWrite as (...a: unknown[]) => void)(fd, data, ...rest);
      const cb = rest[rest.length - 1] as (e: null, n: number) => void;
      cb(null, (data as string).length);
    }) as unknown as typeof fs.write);
    try {
      const pr = await setupPr();
      // run 1 succeeds; run 2 fails with the token echoed on stderr
      const ok = await mk({ logLevel: 'debug', script: (c) => c.finish(0, null, successOut()) });
      const okRes = await ok.start(pr.id, await ok.agent());
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      const okRun = okRes.json().runs[0].run_id as string;
      await ok.app.close();

      const bad = await mk({ logLevel: 'debug', script: (c) => c.finish(1, null, '', `denied ${TOKEN} Bearer ${TOKEN}`) });
      const badRes = await bad.start(pr.id, await bad.agent());
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
      const badRun = badRes.json().runs[0].run_id as string;
      const row = await bad.runRow(badRun);
      const everything = [
        JSON.stringify(row), JSON.stringify(await bad.trace(badRun)), JSON.stringify(await ok.runRow(okRun)),
        badRes.body, okRes.body,
      ].join('\n');
      await bad.app.close();

      const logs = written.join('');
      expect(logs.length).toBeGreaterThan(0); // logging really was captured
      expect(logs).toContain(okRun); // the NFR-10 / run lines are there ...
      expect(logs).toContain('local claude call');
      expect(logs).not.toContain(TOKEN); // ... and none carries the token
      expect(everything).not.toContain(TOKEN);
    } finally {
      spy.mockRestore();
      spy2.mockRestore();
    }
  });

  it('null tokens when the CLI reports no usage (AC-41)', async () => {
    const m = await mk({ script: (c) => c.finish(0, null, successOut(null)) });
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(await m.runRow(runId)).toMatchObject({ status: 'done', tokensIn: null, tokensOut: null, costUsd: 0 });
    await m.app.close();
  });

  const GARBAGE = '{"type":"result","subtype":"success","is_error":false,"result":"not json"}';
  const cases: {
    reason: string;
    opts: Parameters<typeof mk>[0];
    spawns: number;
    contains?: string;
  }[] = [
    { reason: 'token_missing', opts: { token: null }, spawns: 0 },
    { reason: 'cli_missing', opts: { exec: cliGone }, spawns: 0 },
    { reason: 'auth_failed', opts: { script: (c) => c.finish(1, null, fixture('auth-failed.json')) }, spawns: 1, contains: 'claude setup-token' },
    { reason: 'rate_limited', opts: { script: (c) => c.finish(1, null, fixture('session-limit.json')) }, spawns: 1, contains: '3:45pm' },
    { reason: 'invalid_output', opts: { script: (c) => c.finish(0, null, GARBAGE) }, spawns: 3 },
    { reason: 'cli_error', opts: { script: (c) => c.finish(1, null, '', `boom ${TOKEN}`) }, spawns: 1 },
  ];

  it.each(cases)('failure $reason: failed run with typed reason, 2xx start, no review row (AC-23-25, 27, 33, 43, NFR-8)', async ({ reason, opts, spawns, contains }) => {
    const m = await mk(opts);
    const pr = await setupPr();
    const res = await m.start(pr.id, await m.agent());
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const row = await m.runRow(runId);
    expect(row).toMatchObject({ status: 'failed', failureReason: reason, billing: 'subscription', costUsd: null, tokensIn: null, tokensOut: null });
    expect(row.error!.startsWith(`${reason}: `)).toBe(true);
    if (contains) expect(row.error).toContain(contains);
    expect(row.error!.length).toBeLessThan(700);
    expect(m.spawned).toHaveLength(spawns);
    expect(await m.reviewsOf(runId)).toHaveLength(0);

    const tr = await m.trace(runId);
    expect(tr.stats).toMatchObject({ billing: 'subscription', failure_reason: reason, cost_usd: null });
    expect(apiCalls(m.api)).toBe(0);
    expect(JSON.stringify(row) + JSON.stringify(tr)).not.toContain(TOKEN);
    await m.app.close();
  });

  it('timeout after 300 s: failed with reason timeout (AC-27, AC-30)', async () => {
    const m = await mk(); // child hangs
    const pr = await setupPr();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const res = await m.start(pr.id, await m.agent());
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await eventually(() => m.spawned.length === 1);
    await vi.advanceTimersByTimeAsync(300_000);
    await eventually(async () => (await m.runRow(runId)).status === 'failed');
    vi.useRealTimers();
    const row = await m.runRow(runId);
    expect(row).toMatchObject({ failureReason: 'timeout', billing: 'subscription', costUsd: null });
    expect(row.error!.startsWith('timeout: ')).toBe(true);
    expect(await m.reviewsOf(runId)).toHaveLength(0);
    await m.app.close();
  });

  it('Run all: a Local failure does not stop the API agent (AC-26)', async () => {
    const m = await mk({ token: null });
    const pr = await setupPr();
    const localId = await m.agent('local', 'sonnet');
    const orId = await m.agent('openrouter', 'some/model');
    const res = await m.app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
    expect(res.statusCode).toBe(200);
    const runs = res.json().runs as { run_id: string; agent_id: string }[];
    await waitForPrRuns(pg.handle.db, pr.id, { expected: runs.length });
    const byAgent = async (id: string) => m.runRow(runs.find((r) => r.agent_id === id)!.run_id);
    expect(await byAgent(localId)).toMatchObject({ status: 'failed', failureReason: 'token_missing' });
    expect(await byAgent(orId)).toMatchObject({ status: 'done', billing: 'api' });
    await m.app.close();
  });

  it('5 concurrent runs: at most 2 spawns, the rest show queued_for_local (AC-36, 37, 38)', async () => {
    let live = 0;
    let max = 0;
    const m = await mk({ script: () => { live++; max = Math.max(max, live); } });
    const pr = await setupPr();
    const runIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await m.start(pr.id, await m.agent());
      expect(r.statusCode).toBe(200);
      runIds.push(r.json().runs[0].run_id);
    }
    await eventually(() => m.spawned.length === 2);
    await eventually(() => (m.app.container.localGate as { inFlight: number }).inFlight === 2);
    await eventually(async () => {
      const runs = (await m.app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json() as { queued_for_local: boolean }[];
      return runs.filter((r) => r.queued_for_local).length === 3;
    });
    const active = (await m.app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` })).json();
    expect(active.filter((r: { queued_for_local: boolean }) => r.queued_for_local)).toHaveLength(3);
    expect(active[0]).toHaveProperty('billing', 'subscription');
    // queued info event is in the live log
    expect(m.app.container.runBus.buffer(runIds[4]!).some((e) => e.msg.includes('Queued: waiting for a Local slot'))).toBe(true);

    // drain: finish children as they appear
    const done = new Set<Spawned>();
    await eventually(() => {
      for (const s of m.spawned) if (!done.has(s)) { done.add(s); live--; s.child.finish(0, null, successOut()); }
      return done.size === 5;
    }, 20_000);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 5, timeoutMs: 20_000 });
    expect(m.spawned).toHaveLength(5);
    expect(max).toBeLessThanOrEqual(2);
    await m.app.close();
  });

  it('cancel a running Local run: child killed within 5 s, run cancelled, no review (AC-31, 33)', async () => {
    const m = await mk();
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await eventually(() => m.spawned.length === 1);
    const t0 = Date.now();
    const c = await m.app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(c.statusCode).toBeLessThan(300);
    await eventually(() => m.spawned[0]!.child.kills.length > 0);
    expect(Date.now() - t0).toBeLessThan(5000);
    await eventually(async () => (await m.runRow(runId)).status === 'cancelled');
    await new Promise((r) => setTimeout(r, 100));
    const row = await m.runRow(runId);
    expect(row).toMatchObject({ status: 'cancelled', failureReason: null });
    expect(await m.reviewsOf(runId)).toHaveLength(0);
    await m.app.close();
  });

  it('cancel a queued Local run: never spawned, slot not leaked (AC-31, 38)', async () => {
    const m = await mk();
    const pr = await setupPr();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await m.start(pr.id, await m.agent())).json().runs[0].run_id);
    await eventually(() => m.spawned.length === 2);
    await eventually(() => m.app.container.localGate.isQueued(ids[2]!));
    await m.app.inject({ method: 'POST', url: `/runs/${ids[2]}/cancel` });
    await eventually(async () => (await m.runRow(ids[2]!)).status === 'cancelled');
    await new Promise((r) => setTimeout(r, 100));
    expect(m.spawned).toHaveLength(2);
    expect(m.app.container.localGate.isQueued(ids[2]!)).toBe(false);
    expect(await m.reviewsOf(ids[2]!)).toHaveLength(0);
    for (const s of m.spawned) s.child.finish(0, null, successOut());
    await m.app.close();
  });

  it('queued 400 s then a 10 s call still succeeds: queue wait is not the timeout (AC-39)', async () => {
    let now = 1_000_000;
    const m = await mk({ clock: () => now });
    const pr = await setupPr();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await m.start(pr.id, await m.agent())).json().runs[0].run_id);
    await eventually(() => m.spawned.length === 2);
    await eventually(() => m.app.container.localGate.isQueued(ids[2]!));
    now += 400_000;
    m.spawned[0]!.child.finish(0, null, successOut());
    await eventually(() => m.spawned.length === 3);
    now += 10_000;
    m.spawned[2]!.child.finish(0, null, successOut());
    m.spawned[1]!.child.finish(0, null, successOut());
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, timeoutMs: 15_000 });
    const rows = await Promise.all(ids.map((i) => m.runRow(i)));
    expect(rows.every((r) => r.status === 'done')).toBe(true);
    const queued = await Promise.all(ids.map((i) => m.trace(i)));
    expect(Math.max(...queued.map((q) => q.stats.queued_ms as number))).toBeGreaterThanOrEqual(400_000);
    await m.app.close();
  });

  it('AC-32: a long CLI stderr is stored as cli_error with at most 500 characters of message', async () => {
    const m = await mk({ script: (c) => c.finish(1, null, '', `${TOKEN} ${'e'.repeat(3000)}`) });
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const row = await m.runRow(runId);
    expect(row).toMatchObject({ status: 'failed', failureReason: 'cli_error' });
    expect(row.error!.startsWith('cli_error: ')).toBe(true);
    expect(row.error!.slice('cli_error: '.length).length).toBeLessThanOrEqual(500);
    expect(row.error).not.toContain(TOKEN);
    const runs = (await m.app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].error.slice('cli_error: '.length).length).toBeLessThanOrEqual(500);
    expect(await m.reviewsOf(runId)).toHaveLength(0);
    await m.app.close();
  });

  it('AC-29: a rate limit is not retried automatically and carries the reset time', async () => {
    const m = await mk({ script: (c) => c.finish(1, null, fixture('session-limit.json')) });
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await new Promise((r) => setTimeout(r, 150));
    expect(m.spawned).toHaveLength(1);
    expect((await m.runRow(runId)).error).toContain('3:45pm');
    await m.app.close();
  });

  it('AC-23: invalid output twice then valid → the run succeeds after 3 CLI calls and persists the review', async () => {
    const m = await mk({ script: (c, n) => c.finish(0, null, n < 3 ? GARBAGE : successOut()) });
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(await m.runRow(runId)).toMatchObject({ status: 'done', billing: 'subscription', costUsd: 0 });
    expect(m.spawned).toHaveLength(3);
    expect(await m.reviewsOf(runId)).toHaveLength(1);
    await m.app.close();
  });

  it('AC-31: a child that ignores SIGTERM is SIGKILLed within 5 s of cancel; run is cancelled', async () => {
    const m = await mk();
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await eventually(() => m.spawned.length === 1);
    const child = m.spawned[0]!.child;
    child.stubborn = true;
    const t0 = Date.now();
    await m.app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    await eventually(() => child.signalCode === 'SIGKILL', 5000);
    expect(Date.now() - t0).toBeLessThan(5000);
    await eventually(async () => (await m.runRow(runId)).status === 'cancelled');
    expect(await m.reviewsOf(runId)).toHaveLength(0);
    await m.app.close();
  });

  it('cancelled before the executor starts the agent (queued in PQueue / loading diff): 0 spawns, stays cancelled (AC-31)', async () => {
    const m = await mk({ script: (c) => c.finish(0, null, successOut()) });
    const pr = await setupPr();
    const c = m.app.container;
    const agentId = await m.agent();
    const agent = (await c.agentsRepo.getById(workspaceId, agentId))!;
    const repo = (await c.reviewRepo.getRepo(pr.repoId))!;
    const runId = await c.reviewRepo.createAgentRun({
      workspaceId, agentId, prId: pr.id, provider: agent.provider, model: agent.model,
    });
    // exactly what ReviewService.cancelRun does, BEFORE runOneAgent registers
    c.runBus.cancel(runId);
    await c.reviewRepo.cancelRunIfRunning(runId);
    c.runBus.complete(runId);

    await new ReviewRunExecutor(c, c.reviewRepo, c.agentsRepo).executeRuns(workspaceId, pr, repo, [{ agent, runId }]);

    expect(m.spawned).toHaveLength(0);
    expect(await m.runRow(runId)).toMatchObject({ status: 'cancelled', failureReason: null });
    expect(await m.reviewsOf(runId)).toHaveLength(0);
    await m.app.close();
  });

  it('a late completion never overwrites a cancelled row', async () => {
    const m = await mk();
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await eventually(() => m.spawned.length === 1);
    await m.app.container.reviewRepo.cancelRunIfRunning(runId); // row cancelled, child still alive
    m.spawned[0]!.child.finish(0, null, successOut());
    await new Promise((r) => setTimeout(r, 500));
    expect((await m.runRow(runId)).status).toBe('cancelled');
    await m.app.close();
  });

  it('cancel between the CLI returning and the persist transaction: no review row, stays cancelled (AC-33)', async () => {
    const m = await mk();
    const pr = await setupPr();
    const runId = (await m.start(pr.id, await m.agent())).json().runs[0].run_id as string;
    await eventually(() => m.spawned.length === 1);
    // Row is cancelled (as cancelRun does) but the live child still returns a
    // perfectly good review: the persist step must notice and write nothing.
    await m.app.container.reviewRepo.cancelRunIfRunning(runId);
    m.spawned[0]!.child.finish(0, null, successOut());
    await new Promise((r) => setTimeout(r, 500));
    expect(await m.reviewsOf(runId)).toHaveLength(0);
    expect((await m.runRow(runId)).status).toBe('cancelled');
    await m.app.close();
  });
});
