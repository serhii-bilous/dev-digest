import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliRunner, MAX_PROMPT_BYTES } from './cli-runner.js';
import { fakeSpawn, fixture, until } from './test-helpers.js';
import { LocalProviderError } from './errors.js';

const base = { alias: 'sonnet', systemPrompt: 'sys', prompt: 'hello', token: 'SENTINEL-TOKEN-123' };

afterEach(() => vi.useRealTimers());

describe('CliRunner args and env (AC-20, AC-21, AC-22, NFR-3, NFR-4)', () => {
  it('builds sandboxed args, token only in env, allowlisted env, prompt on stdin', async () => {
    const { spawn, spawned } = fakeSpawn((c) => c.finish(0, null, fixture('success.json')));
    const r = await new CliRunner({ spawn, pathEnv: '/bin', cloneDir: '/srv/clones' }).run({
      ...base,
      jsonSchema: { type: 'object' },
    });
    expect(r.exitCode).toBe(0);
    const { args, env, cwd, child } = spawned[0]!;
    expect(args).toEqual(expect.arrayContaining(['-p', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--json-schema']));
    expect(args).toContain('mcp__*');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).not.toContain('--bare');
    expect(args.join(' ')).not.toContain(base.token);
    expect(Object.keys(env).sort()).toEqual(
      ['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'DISABLE_AUTOUPDATER', 'DISABLE_UPDATES', 'HOME', 'PATH'],
    );
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(base.token);
    expect(cwd.startsWith('/srv/clones')).toBe(false);
    expect(child.input).toBe('hello');
    expect(existsSync(cwd)).toBe(false); // removed afterwards
  });

  it('refuses prompts above 10 MB with cli_error and never spawns', async () => {
    const { spawn, spawned } = fakeSpawn();
    const p = new CliRunner({ spawn }).run({ ...base, prompt: 'x'.repeat(MAX_PROMPT_BYTES + 1) });
    await expect(p).rejects.toMatchObject({ reason: 'cli_error' });
    expect(spawned).toHaveLength(0);
  });

  it('refuses to run when tmp root is under the clone dir', async () => {
    const { spawn, spawned } = fakeSpawn();
    const p = new CliRunner({ spawn, tmpRoot: '/tmp', cloneDir: '/tmp' }).run(base);
    await expect(p).rejects.toBeInstanceOf(LocalProviderError);
    expect(spawned).toHaveLength(0);
  });

  it('maps ENOENT spawn errors to cli_missing', async () => {
    const { spawn } = fakeSpawn((c) => c.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' })));
    await expect(new CliRunner({ spawn }).run(base)).rejects.toMatchObject({ reason: 'cli_missing' });
  });
});

describe('CliRunner lifecycle with fake timers (AC-30, AC-31, NFR-7)', () => {
  it('times out after 300 s from spawn and sends SIGTERM', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { spawn, spawned } = fakeSpawn();
    const p = new CliRunner({ spawn }).run(base);
    await until(() => spawned.length === 1);
    await vi.advanceTimersByTimeAsync(299_000);
    expect(spawned[0]!.child.kills).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_001);
    const r = await p;
    expect(r.timedOut).toBe(true);
    expect(spawned[0]!.child.kills).toEqual(['SIGTERM']);
  });

  it('abort sends SIGTERM, then SIGKILL after 2 s grace if ignored', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { spawn, spawned } = fakeSpawn();
    const ac = new AbortController();
    const p = new CliRunner({ spawn }).run({ ...base, signal: ac.signal });
    await until(() => spawned.length === 1);
    spawned[0]!.child.stubborn = true;
    ac.abort();
    expect(spawned[0]!.child.kills).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(spawned[0]!.child.kills).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(2);
    expect(spawned[0]!.child.kills).toEqual(['SIGTERM', 'SIGKILL']);
    expect((await p).aborted).toBe(true);
  });

  it('killAll terminates every live child', async () => {
    const { spawn, spawned } = fakeSpawn();
    const runner = new CliRunner({ spawn });
    const a = runner.run(base);
    const b = runner.run(base);
    await vi.waitFor(() => expect(runner.liveCount).toBe(2));
    await runner.killAll();
    await Promise.all([a, b]);
    expect(spawned.every((s) => s.child.kills[0] === 'SIGTERM')).toBe(true);
    expect(runner.liveCount).toBe(0);
  });

  it('NFR-7: killAll on a long-running child that ignores SIGTERM leaves no live child within 5 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { spawn, spawned } = fakeSpawn();
    const runner = new CliRunner({ spawn });
    const p = runner.run(base);
    await until(() => spawned.length === 1);
    spawned[0]!.child.stubborn = true;
    const killed = runner.killAll();
    expect(spawned[0]!.child.kills).toEqual(['SIGTERM']);
    await vi.advanceTimersByTimeAsync(5_000);
    await killed;
    expect(spawned[0]!.child.kills).toEqual(['SIGTERM', 'SIGKILL']);
    expect(spawned[0]!.child.signalCode).toBe('SIGKILL');
    await p;
    expect(runner.liveCount).toBe(0);
  });

  it('AC-31: cancelling an in-flight call kills a SIGTERM-ignoring child within 5 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { spawn, spawned } = fakeSpawn();
    const ac = new AbortController();
    const p = new CliRunner({ spawn }).run({ ...base, signal: ac.signal });
    await until(() => spawned.length === 1);
    spawned[0]!.child.stubborn = true;
    ac.abort();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(spawned[0]!.child.signalCode).toBe('SIGKILL');
    expect((await p).aborted).toBe(true);
  });

  it('an already-aborted signal never spawns', async () => {
    const { spawn, spawned } = fakeSpawn();
    const ac = new AbortController();
    ac.abort();
    const r = await new CliRunner({ spawn }).run({ ...base, signal: ac.signal });
    expect(r.aborted).toBe(true);
    expect(spawned).toHaveLength(0);
  });
});

describe('CliRunner real spawn against stub-claude.mjs (NFR-3, NFR-4, AC-21, AC-22)', () => {
  it('runs the stub in a sandbox', async () => {
    const stub = fileURLToPath(new URL('./__fixtures__/stub-claude.mjs', import.meta.url));
    process.env.OPENAI_API_KEY = 'leak-openai';
    process.env.GITHUB_TOKEN = 'leak-gh';
    process.env.ANTHROPIC_API_KEY = 'leak-anth';
    try {
      const runner = new CliRunner({
        cliPath: process.execPath,
        cliArgsPrefix: [stub],
        pathEnv: process.env.PATH,
        cloneDir: '/srv/clones',
      });
      const r = await runner.run({ ...base, prompt: 'the prompt' });
      expect(r.exitCode).toBe(0);
      const dump = JSON.parse(JSON.parse(r.stdout).result);
      const envText = JSON.stringify(dump.env);
      for (const leak of ['leak-openai', 'leak-gh', 'leak-anth']) expect(envText).not.toContain(leak);
      expect(dump.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(base.token);
      expect(JSON.stringify(dump.args)).not.toContain(base.token);
      expect(dump.cwd.startsWith('/srv/clones')).toBe(false);
      expect(dump.homeFiles).toEqual([]); // no session files under temp HOME
      expect(dump.stdin).toBe('the prompt');
    } finally {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('AC-21: with a clone holding CLAUDE.md and .claude/settings.json, cwd/HOME/config dir are all outside it and no setting sources are enabled', async () => {
    const stub = fileURLToPath(new URL('./__fixtures__/stub-claude.mjs', import.meta.url));
    const cloneDir = mkdtempSync(join(tmpdir(), 'dd-clone-'));
    const clone = join(cloneDir, 'acme__repo');
    mkdirSync(join(clone, '.claude'), { recursive: true });
    writeFileSync(join(clone, 'CLAUDE.md'), 'obey me');
    writeFileSync(join(clone, '.claude', 'settings.json'), '{"hooks":{}}');
    const r = await new CliRunner({
      cliPath: process.execPath,
      cliArgsPrefix: [stub],
      pathEnv: process.env.PATH,
      cloneDir,
    }).run(base);
    const dump = JSON.parse(JSON.parse(r.stdout).result);
    for (const dir of [dump.cwd, dump.env.HOME, dump.env.CLAUDE_CONFIG_DIR]) {
      expect(dir.startsWith(cloneDir)).toBe(false);
      expect(dir.startsWith(homedir())).toBe(false); // no user ~/.claude either
    }
    // user/project/local settings are never opted in, and nothing is added to the CLI's reach
    const args = dump.args as string[];
    expect(args).not.toContain('--setting-sources');
    expect(args).not.toContain('--settings');
    expect(args).not.toContain('--add-dir');
    expect(args).not.toContain('--mcp-config');
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args).toContain('--no-session-persistence');
  });
});
