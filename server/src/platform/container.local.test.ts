import { tmpdir } from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import type { SecretKey, SecretsProvider } from '@devdigest/shared';
import { buildApp } from '../app.js';
import { loadConfig } from './config.js';
import { MockAuthProvider } from '../adapters/mocks.js';
import { FakeChild, fakeSpawn, fixture } from '../adapters/llm/local/test-helpers.js';
import type { ExecFn } from '../adapters/llm/local/index.js';

/** Hermetic (no DB, no real CLI). Covers the Local wiring over HTTP. */
const TOKEN = 'sentinel-oauth-token-123';
const cfg = (env = 'test') =>
  loadConfig({ ...process.env, NODE_ENV: env, LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

const cliOk: ExecFn = async () => ({ stdout: '2.1.311 (Claude Code)\n', exitCode: 0 });
const cliGone: ExecFn = async () => ({ stdout: '', exitCode: null });

function secretsWith(initial: Record<string, string> = {}): SecretsProvider & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
    get: async (k: SecretKey) => store[k as string],
    set: async (k: SecretKey, v: string) => {
      store[k as string] = v;
    },
  };
}

async function mk(opts: {
  exec?: ExecFn;
  token?: string;
  script?: (c: FakeChild, n: number) => void;
  env?: string;
}) {
  const secrets = secretsWith(opts.token ? { LOCAL_CLAUDE_OAUTH_TOKEN: opts.token } : {});
  const fs = fakeSpawn(opts.script);
  const app = await buildApp({
    config: cfg(opts.env),
    overrides: {
      auth: new MockAuthProvider(),
      secrets,
      local: { exec: opts.exec ?? cliOk, spawn: fs.spawn, tmpRoot: tmpdir() },
    },
  });
  return { app, secrets, ...fs };
}

describe('Local status (AC-1..4, NFR-1)', () => {
  it.each([
    [cliOk, TOKEN, { available: true, cli_version: '2.1.311', token_configured: true }],
    [cliOk, undefined, { available: false, reason: 'token_missing', cli_version: '2.1.311', token_configured: false }],
    [cliGone, TOKEN, { available: false, reason: 'cli_missing', token_configured: true }],
    [cliGone, undefined, { available: false, reason: 'cli_missing', token_configured: false }],
  ])('combination %#', async (exec, token, expected) => {
    const { app, spawned } = await mk({ exec, token });
    const res = await app.inject({ method: 'GET', url: '/settings/local-status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(expected);
    expect(spawned).toHaveLength(0); // no model call
    await app.close();
  });

  it('a host CLAUDE_CODE_OAUTH_TOKEN does not count as configured (AC-4)', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'host-login';
    try {
      const { app } = await mk({});
      const res = await app.inject({ method: 'GET', url: '/settings/local-status' });
      expect(res.json().reason).toBe('token_missing');
      await app.close();
    } finally {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });

  it('NFR-1: status and model list answer within 2 s and make no model call', async () => {
    const { app, spawned } = await mk({ token: TOKEN });
    for (const url of ['/settings/local-status', '/providers/local/models']) {
      const t0 = Date.now();
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(Date.now() - t0).toBeLessThan(2000);
    }
    expect(spawned).toHaveLength(0);
    await app.close();
  });

  it('an ANTHROPIC_API_KEY in the environment is not a Local token either (AC-4)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-host';
    try {
      const { app } = await mk({});
      const res = await app.inject({ method: 'GET', url: '/settings/local-status' });
      expect(res.json()).toMatchObject({ available: false, reason: 'token_missing', token_configured: false });
      await app.close();
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('GET /providers/local/models: 3 aliases when available, [] otherwise (AC-5, AC-6)', async () => {
    const ok = await mk({ token: TOKEN });
    const res = await ok.app.inject({ method: 'GET', url: '/providers/local/models' });
    expect(res.json().map((m: { id: string }) => m.id)).toEqual(['opus', 'sonnet', 'haiku']);
    await ok.app.close();
    const no = await mk({});
    expect((await no.app.inject({ method: 'GET', url: '/providers/local/models' })).json()).toEqual([]);
    await no.app.close();
  });
});

describe('Local token save + secrets-status (AC-13, AC-15, NFR-3)', () => {
  it('saves the token, next call uses it without restart, never echoes it', async () => {
    const { app, secrets, spawned } = await mk({ script: (c) => c.finish(0, null, fixture('success.json')) });
    const before = await app.inject({ method: 'GET', url: '/settings/local-status' });
    expect(before.json().reason).toBe('token_missing');

    const save = await app.inject({ method: 'POST', url: '/settings/secrets', payload: { provider: 'local', key: TOKEN } });
    expect(save.statusCode).toBe(200);
    expect(save.json()).toMatchObject({ available: true, token_configured: true });
    expect(save.body).not.toContain(TOKEN);
    expect(secrets.store.LOCAL_CLAUDE_OAUTH_TOKEN).toBe(TOKEN);
    expect(spawned).toHaveLength(0); // saving makes no model call

    const status = await app.inject({ method: 'GET', url: '/settings/secrets-status' });
    expect(status.json().local).toBe(true);
    expect(status.body).not.toContain(TOKEN);

    const llm = await app.container.llmFor('local');
    await llm.complete({ model: 'haiku', messages: [{ role: 'user', content: 'hi' }] });
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(spawned[0]!.args.join(' ')).not.toContain(TOKEN);
    await app.close();
  });

  it('rejects an empty key / wrong provider with 422', async () => {
    const { app } = await mk({});
    for (const payload of [{ provider: 'local', key: '' }, { provider: 'openai', key: 'x' }]) {
      const r = await app.inject({ method: 'POST', url: '/settings/secrets', payload });
      expect(r.statusCode).toBe(422);
    }
    await app.close();
  });
});

describe('Local test-connection (AC-16, AC-17, NFR-2)', () => {
  const test = (app: Awaited<ReturnType<typeof mk>>['app']) =>
    app.inject({ method: 'POST', url: '/settings/test-connection', payload: { provider: 'local' } });

  it('ok:true naming the CLI version after exactly one CLI call', async () => {
    const { app, spawned } = await mk({ token: TOKEN, script: (c) => c.finish(0, null, fixture('success.json')) });
    const res = await test(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ provider: 'local', ok: true });
    expect(res.json().message).toContain('2.1.311');
    expect(spawned).toHaveLength(1);
    await app.close();
  });

  it('logs one NFR-10 line for the connection-test call, without secrets', async () => {
    const { app } = await mk({ token: TOKEN, script: (c) => c.finish(0, null, fixture('success.json')) });
    const lines: unknown[] = [];
    const log = app.log as unknown as { info: (o: unknown, m?: string) => void };
    const orig = log.info.bind(log);
    log.info = (o, m) => (lines.push(o), orig(o, m));
    await test(app);
    const line = lines.find((l) => (l as { runId?: string }).runId === 'conn-test') as Record<string, unknown>;
    expect(line).toMatchObject({ model: 'haiku', outcome: 'ok' });
    expect(line).toHaveProperty('queuedMs');
    expect(line).toHaveProperty('durationMs');
    expect(JSON.stringify(lines)).not.toContain(TOKEN);
    await app.close();
  });

  it('unavailable → ok:false with reason, no spawn', async () => {
    const { app, spawned } = await mk({});
    const res = await test(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'token_missing' });
    expect(spawned).toHaveLength(0);
    await app.close();
  });

  it('auth error → 200 ok:false auth_failed, token redacted', async () => {
    const { app } = await mk({
      token: TOKEN,
      script: (c) => c.finish(1, null, fixture('auth-failed.json'), `bad token ${TOKEN}`),
    });
    const res = await test(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, reason: 'auth_failed' });
    expect(res.json().message).toContain('claude setup-token');
    expect(res.body).not.toContain(TOKEN);
    await app.close();
  });
});

describe('Local rate limits (NFR-5)', () => {
  it('21st call returns 429 on test-connection and secrets', async () => {
    const { app } = await mk({ env: 'development', token: TOKEN, script: (c) => c.finish(0, null, fixture('success.json')) });
    const hit = (url: string, payload: Record<string, string>) => app.inject({ method: 'POST', url, payload });
    for (let i = 0; i < 20; i++) {
      expect((await hit('/settings/test-connection', { provider: 'local' })).statusCode).toBe(200);
    }
    expect((await hit('/settings/test-connection', { provider: 'local' })).statusCode).toBe(429);
    for (let i = 0; i < 20; i++) {
      expect((await hit('/settings/secrets', { provider: 'local', key: TOKEN })).statusCode).toBe(200);
    }
    expect((await hit('/settings/secrets', { provider: 'local', key: TOKEN })).statusCode).toBe(429);
    await app.close();
  });
});

describe('llmFor + shutdown (NFR-7)', () => {
  it('local unavailable → LocalProviderError, no spawn', async () => {
    const { app, spawned } = await mk({});
    await expect(app.container.llmFor('local')).rejects.toMatchObject({ reason: 'token_missing' });
    expect(spawned).toHaveLength(0);
    await app.close();
  });

  it('api ids delegate to llm()', async () => {
    const stub = { id: 'openai' } as never;
    const app = await buildApp({ config: cfg(), overrides: { llm: { openai: stub } } });
    expect(await app.container.llmFor('openai')).toBe(stub);
    await app.close();
  });

  it('app.close() kills live CLI children', async () => {
    const { app, spawned } = await mk({ token: TOKEN }); // hanging stub
    const llm = await app.container.llmFor('local');
    const p = llm.complete({ model: 'haiku', messages: [{ role: 'user', content: 'x' }] }).catch(() => undefined);
    for (let i = 0; i < 200 && spawned.length === 0; i++) await new Promise((r) => setImmediate(r));
    expect(spawned).toHaveLength(1);
    await app.close();
    expect(spawned[0]!.child.kills).toContain('SIGTERM');
    await p;
  });

  it('NFR-7: graceful shutdown leaves no live child within 5 s, even if SIGTERM is ignored', async () => {
    const { app, spawned } = await mk({ token: TOKEN }); // hanging stub
    const llm = await app.container.llmFor('local');
    const p = llm.complete({ model: 'haiku', messages: [{ role: 'user', content: 'x' }] }).catch(() => undefined);
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    const child = spawned[0]!.child;
    child.stubborn = true;
    const t0 = Date.now();
    await app.close();
    await vi.waitFor(() => expect(child.signalCode).toBe('SIGKILL'), { timeout: 5000, interval: 50 });
    expect(Date.now() - t0).toBeLessThan(5000);
    await p;
  });
});
