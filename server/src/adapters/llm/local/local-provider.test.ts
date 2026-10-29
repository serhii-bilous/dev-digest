import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { LocalClaudeProvider } from './local-provider.js';
import { CliRunner } from './cli-runner.js';
import { LocalSlotGate } from './slot-gate.js';
import { fakeSpawn, fixture, until } from './test-helpers.js';

const TOKEN = 'SENTINEL-TOKEN-123';
const schema = z.object({ ok: z.boolean(), n: z.number() });
const available = async () => ({ available: true as const, token_configured: true, cli_version: '2.1.296' });
const msgs = [
  { role: 'system' as const, content: 'sys' },
  { role: 'user' as const, content: 'review this' },
];

function make(script?: Parameters<typeof fakeSpawn>[0], over: Partial<ConstructorParameters<typeof LocalClaudeProvider>[0]> = {}) {
  const { spawn, spawned } = fakeSpawn(script);
  const logger = { info: vi.fn() };
  const gate = new LocalSlotGate(2);
  const provider = new LocalClaudeProvider({
    runner: new CliRunner({ spawn }),
    gate,
    probe: available,
    getToken: () => TOKEN,
    logger,
    ctx: { runId: 'run-1' },
    ...over,
  });
  return { provider, spawned, logger, gate };
}
const req = { model: 'sonnet', schema, schemaName: 'Out', messages: msgs };
const invalid = '{"type":"result","subtype":"success","is_error":false,"result":"not json at all"}';

describe('LocalClaudeProvider', () => {
  it('listModels returns the 3 aliases without spawning (AC-5)', async () => {
    const { provider, spawned } = make();
    const m = await provider.listModels();
    expect(m.map((x) => x.id)).toEqual(['opus', 'sonnet', 'haiku']);
    expect(spawned).toHaveLength(0);
  });

  it('embed throws (AC-46)', async () => {
    await expect(make().provider.embed()).rejects.toThrow('embeddings not supported by Local');
  });

  it('success: cost 0, tokens, attempts 1, one log line without secrets (AC-41, NFR-10)', async () => {
    const { provider, logger } = make((c) => c.finish(0, null, fixture('success.json')));
    const r = await provider.completeStructured(req);
    expect(r).toMatchObject({ data: { ok: true, n: 3 }, costUsd: 0, tokensIn: 120, tokensOut: 34, attempts: 1, model: 'sonnet' });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logger.info.mock.calls[0]);
    expect(line).toContain('run-1');
    expect(line).toContain('"outcome":"ok"');
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain('review this');
  });

  it('missing usage -> null tokens', async () => {
    const { provider } = make((c) => c.finish(0, null, fixture('success-no-usage.json')));
    const r = await provider.completeStructured(req);
    expect(r.tokensIn).toBeNull();
    expect(r.tokensOut).toBeNull();
  });

  it('reprompts: invalid twice then valid -> attempts 3 (AC-23)', async () => {
    const { provider, spawned } = make((c, n) => c.finish(0, null, n < 3 ? invalid : fixture('success.json')));
    const r = await provider.completeStructured(req);
    expect(r.attempts).toBe(3);
    expect(spawned[2]!.child.input).toContain('not json at all');
  });

  it('always invalid -> invalid_output after 3 spawns (AC-24)', async () => {
    const { provider, spawned, logger } = make((c) => c.finish(0, null, invalid));
    await expect(provider.completeStructured(req)).rejects.toMatchObject({ reason: 'invalid_output' });
    expect(spawned).toHaveLength(3);
    expect(JSON.stringify(logger.info.mock.calls[0])).toContain('invalid_output');
  });

  it('error_max_structured_output_retries counts as an invalid attempt', async () => {
    const { provider, spawned } = make((c, n) =>
      n === 1 ? c.finish(1, null, fixture('max-structured-retries.json')) : c.finish(0, null, fixture('success.json')),
    );
    const r = await provider.completeStructured(req);
    expect(r.attempts).toBe(2);
    expect(spawned).toHaveLength(2);
    expect(spawned[1]!.child.input).not.toBe(spawned[0]!.child.input);
  });

  it.each([
    ['auth_failed', 'auth-failed.json'],
    ['rate_limited', 'session-limit.json'],
    ['rate_limited', 'rate-429.json'],
  ])('%s from %s: one spawn, no retry (AC-28, AC-29, AC-33)', async (reason, file) => {
    const { provider, spawned } = make((c) => c.finish(1, null, fixture(file)));
    await expect(provider.completeStructured(req)).rejects.toMatchObject({ reason });
    expect(spawned).toHaveLength(1);
  });

  it('cli_error with token echoed to stderr is redacted and capped (NFR-3, AC-32)', async () => {
    const { provider } = make((c) => c.finish(1, null, '', `boom ${TOKEN} ${'z'.repeat(1000)}`));
    const e = await provider.completeStructured(req).catch((x) => x);
    expect(e.reason).toBe('cli_error');
    expect(e.message.length).toBeLessThanOrEqual(500);
    expect(e.message).not.toContain(TOKEN);
  });

  it('unavailable: throws the reason with zero spawns (AC-25)', async () => {
    const { provider, spawned } = make(undefined, {
      probe: async () => ({ available: false, reason: 'token_missing', token_configured: false }),
    });
    await expect(provider.completeStructured(req)).rejects.toMatchObject({ reason: 'token_missing' });
    expect(spawned).toHaveLength(0);
  });

  it('timeout surfaces as timeout (AC-30)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { spawn, spawned } = fakeSpawn();
      const provider = new LocalClaudeProvider({
        runner: new CliRunner({ spawn }), gate: new LocalSlotGate(2), probe: available,
        getToken: () => TOKEN, logger: { info: vi.fn() },
      });
      const p = provider.complete({ model: 'haiku', messages: msgs }).catch((x) => x);
      await until(() => spawned.length === 1);
      await vi.advanceTimersByTimeAsync(300_001);
      expect((await p).reason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel while queued: no spawn, slot not leaked (AC-38)', async () => {
    const { spawn, spawned } = fakeSpawn();
    const gate = new LocalSlotGate(1);
    const hold = await gate.acquire({ runId: 'other' });
    const ac = new AbortController();
    const onQueued = vi.fn();
    const provider = new LocalClaudeProvider({
      runner: new CliRunner({ spawn }), gate, probe: available, getToken: () => TOKEN,
      logger: { info: vi.fn() }, ctx: { runId: 'r', signal: ac.signal, onQueued },
    });
    const p = provider.completeStructured(req).catch((x) => x);
    await vi.waitFor(() => expect(onQueued).toHaveBeenCalled());
    ac.abort();
    expect((await p).name).toBe('AbortError');
    expect(spawned).toHaveLength(0);
    hold.release();
    expect(gate.inFlight).toBe(0);
  });

  it('complete(): single no-schema call (connection test)', async () => {
    const { provider, spawned } = make((c) => c.finish(0, null, fixture('success-no-usage.json')));
    const r = await provider.complete({ model: 'haiku', messages: msgs });
    expect(r.text).toContain('ok');
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.args).not.toContain('--json-schema');
  });

  it('never holds more than 2 concurrent spawns (AC-36)', async () => {
    let live = 0;
    let max = 0;
    const { provider } = make((c) => {
      live++; max = Math.max(max, live);
      setTimeout(() => { live--; c.finish(0, null, fixture('success.json')); }, 5);
    });
    await Promise.all(Array.from({ length: 5 }, () => provider.completeStructured(req)));
    expect(max).toBe(2);
  });

  it('AC-39: 400 s waiting in the queue does not count toward the 300 s limit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let clock = 0;
      const { spawn, spawned } = fakeSpawn();
      const gate = new LocalSlotGate(1, () => clock);
      const hold = await gate.acquire({ runId: 'other' });
      const logger = { info: vi.fn() };
      const provider = new LocalClaudeProvider({
        runner: new CliRunner({ spawn, now: () => clock }), gate, probe: available,
        getToken: () => TOKEN, logger, ctx: { runId: 'queued-run' },
      });
      const p = provider.completeStructured(req);
      await until(() => gate.isQueued('queued-run'));
      clock += 400_000;
      await vi.advanceTimersByTimeAsync(400_000); // far past the 300 s cap, still queued
      expect(spawned).toHaveLength(0);
      hold.release();
      await until(() => spawned.length === 1);
      clock += 10_000;
      await vi.advanceTimersByTimeAsync(10_000);
      spawned[0]!.child.finish(0, null, fixture('success.json'));
      const r = await p;
      expect(r.data).toMatchObject({ ok: true });
      expect(spawned[0]!.child.kills).toEqual([]);
      expect(logger.info.mock.calls[0]![0]).toMatchObject({ runId: 'queued-run', queuedMs: 400_000, outcome: 'ok' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('NFR-10: a failed call logs one line with the reason as outcome and no CLI output or token', async () => {
    const { provider, logger } = make((c) =>
      c.finish(1, null, fixture('auth-failed.json'), `secret stderr ${TOKEN}`),
    );
    await provider.completeStructured(req).catch(() => undefined);
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [obj] = logger.info.mock.calls[0]!;
    expect(obj).toMatchObject({ runId: 'run-1', model: 'sonnet', outcome: 'auth_failed' });
    expect(obj).toHaveProperty('queuedMs');
    expect(obj).toHaveProperty('durationMs');
    const line = JSON.stringify(logger.info.mock.calls[0]);
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain('secret stderr');
    expect(line).not.toContain('review this');
  });
});
