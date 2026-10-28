import { describe, it, expect, vi } from 'vitest';
import { createProbe } from './availability.js';

const ok = { stdout: '2.1.296 (Claude Code)\n', exitCode: 0 };

describe('createProbe (AC-1..4, NFR-1)', () => {
  const combos: [string, ReturnType<typeof vi.fn>, string | undefined, object][] = [
    ['cli + token', vi.fn(async () => ok), 'tok', { available: true, cli_version: '2.1.296', token_configured: true }],
    ['cli, no token', vi.fn(async () => ok), undefined, { available: false, reason: 'token_missing', token_configured: false }],
    ['no cli, token', vi.fn(async () => ({ stdout: '', exitCode: 127 })), 'tok', { available: false, reason: 'cli_missing', token_configured: true }],
    ['no cli, no token', vi.fn(async () => { throw new Error('ENOENT'); }), undefined, { available: false, reason: 'cli_missing', token_configured: false }],
  ];
  it.each(combos)('%s', async (_n, exec, token, expected) => {
    const probe = createProbe({ cliPath: 'claude', exec: exec as never, getToken: () => token });
    expect(await probe()).toMatchObject(expected);
    expect(exec).toHaveBeenCalledWith('claude', ['--version'], { timeoutMs: 2000 });
  });

  it('non-matching version output is cli_missing', async () => {
    const probe = createProbe({ cliPath: 'x', exec: async () => ({ stdout: 'hello', exitCode: 0 }), getToken: () => 't' });
    expect((await probe()).reason).toBe('cli_missing');
  });

  it('caches the version check for 10 s but re-reads the token every call', async () => {
    let t = 0;
    let token: string | undefined;
    const exec = vi.fn(async () => ok);
    const probe = createProbe({ cliPath: 'claude', exec, getToken: () => token, now: () => t });
    expect((await probe()).reason).toBe('token_missing');
    token = 'new';
    expect((await probe()).available).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    t = 10_001;
    await probe();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('AC-4: host login signals in the environment never count as a configured token', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'host-login';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-host';
    try {
      const probe = createProbe({ cliPath: 'claude', exec: async () => ok, getToken: () => undefined });
      expect(await probe()).toMatchObject({ available: false, reason: 'token_missing', token_configured: false });
    } finally {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
