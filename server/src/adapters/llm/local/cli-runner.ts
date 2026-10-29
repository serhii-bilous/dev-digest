import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { LocalProviderError } from './errors.js';

export const MAX_PROMPT_BYTES = 10 * 1024 * 1024;
/** Linux caps a single argv string at 128 KiB; larger system prompts move to stdin. */
const MAX_SYSTEM_ARG_BYTES = 100_000;
export const DEFAULT_TIMEOUT_MS = 300_000;
export const KILL_GRACE_MS = 2_000;

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcess;

export interface CliRunnerOptions {
  cliPath?: string;
  /** Leading args before the real ones (tests run the stub through `node`). */
  cliArgsPrefix?: string[];
  spawn?: SpawnFn;
  /** PATH for the child (the only inherited variable). Supplied by the composition root. */
  pathEnv?: string;
  /** Clone directory — the child's cwd must never be under it. */
  cloneDir?: string;
  tmpRoot?: string;
  timeoutMs?: number;
  killGraceMs?: number;
  now?: () => number;
}

export interface CliRunInput {
  alias: string;
  systemPrompt: string;
  prompt: string;
  jsonSchema?: unknown;
  token: string;
  signal?: AbortSignal;
}

export interface CliRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timeoutMs: number;
  timedOut: boolean;
  aborted: boolean;
}

export function buildArgs(
  alias: string,
  systemPrompt: string,
  jsonSchema?: unknown,
): string[] {
  const args = [
    '-p',
    '--model', alias,
    '--tools', '',
    '--disallowedTools', 'mcp__*',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--system-prompt', systemPrompt,
    '--output-format', 'json',
  ];
  if (jsonSchema !== undefined) args.push('--json-schema', JSON.stringify(jsonSchema));
  return args;
}

function isUnder(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Spawns the Claude Code CLI in a sandboxed env. Owns the live-child registry. */
export class CliRunner {
  private readonly live = new Set<ChildProcess>();
  private readonly spawnFn: SpawnFn;
  private readonly cliPath: string;
  private readonly now: () => number;

  constructor(private readonly opts: CliRunnerOptions = {}) {
    this.spawnFn = opts.spawn ?? (nodeSpawn as unknown as SpawnFn);
    this.cliPath = opts.cliPath ?? 'claude';
    this.now = opts.now ?? Date.now;
  }

  get liveCount(): number {
    return this.live.size;
  }

  /** Terminate every live child (graceful shutdown, NFR-7). */
  killAll(): Promise<void> {
    const waits = [...this.live].map(
      (c) =>
        new Promise<void>((done) => {
          if (c.exitCode !== null || c.signalCode !== null) return done();
          c.once('close', () => done());
          this.terminate(c, false);
        }),
    );
    return Promise.all(waits).then(() => undefined);
  }

  private terminate(child: ChildProcess, unref = true): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const t = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, this.opts.killGraceMs ?? KILL_GRACE_MS);
    if (unref) t.unref?.();
    child.once('close', () => clearTimeout(t));
  }

  async run(input: CliRunInput): Promise<CliRunResult> {
    let { systemPrompt, prompt } = input;
    if (Buffer.byteLength(systemPrompt) > MAX_SYSTEM_ARG_BYTES) {
      prompt = `${systemPrompt}\n\n${prompt}`;
      systemPrompt = 'Follow the instructions given at the start of the user message.';
    }
    if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
      throw new LocalProviderError('cli_error', 'Prompt is larger than the 10 MB Local limit.');
    }
    if (input.signal?.aborted) {
      return { exitCode: null, signal: null, stdout: '', stderr: '', durationMs: 0, timeoutMs: this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, timedOut: false, aborted: true };
    }

    const base = resolve(this.opts.tmpRoot ?? tmpdir());
    if (this.opts.tmpRoot) {
      await mkdir(base, { recursive: true, mode: 0o700 });
      await chmod(base, 0o700).catch(() => {}); // best-effort on a pre-existing dir we may not own
    }
    const root = await mkdtemp(join(base, 'devdigest-local-'));
    try {
      const cwd = join(root, 'work');
      const home = join(root, 'home');
      const cfg = join(root, 'config');
      await Promise.all([mkdir(cwd), mkdir(home), mkdir(cfg)]);
      if (this.opts.cloneDir && isUnder(cwd, this.opts.cloneDir)) {
        throw new LocalProviderError('cli_error', 'Refusing to run Claude Code inside a repository clone.');
      }
      const env: Record<string, string> = {
        PATH: this.opts.pathEnv ?? '/usr/local/bin:/usr/bin:/bin',
        HOME: home,
        CLAUDE_CONFIG_DIR: cfg,
        CLAUDE_CODE_OAUTH_TOKEN: input.token,
        DISABLE_AUTOUPDATER: '1',
        DISABLE_UPDATES: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      };
      const args = [
        ...(this.opts.cliArgsPrefix ?? []),
        ...buildArgs(input.alias, systemPrompt, input.jsonSchema),
      ];
      return await this.exec(args, env, cwd, prompt, input.signal);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  }

  private exec(
    args: string[],
    env: Record<string, string>,
    cwd: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<CliRunResult> {
    return new Promise((resolvePromise, reject) => {
      const start = this.now();
      let child: ChildProcess;
      try {
        child = this.spawnFn(this.cliPath, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        reject(this.spawnError(e));
        return;
      }
      this.live.add(child);
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let aborted = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        this.terminate(child);
      }, this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const onAbort = () => {
        aborted = true;
        this.terminate(child);
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.live.delete(child);
        fn();
      };

      child.stdout?.on('data', (d: Buffer | string) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer | string) => { stderr += d.toString(); });
      child.on('error', (e) => finish(() => reject(this.spawnError(e))));
      child.on('close', (code: number | null, sig: NodeJS.Signals | null) =>
        finish(() =>
          resolvePromise({
            exitCode: code,
            signal: sig,
            stdout,
            stderr,
            durationMs: this.now() - start,
            timeoutMs: this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            timedOut,
            aborted,
          }),
        ),
      );
      child.stdin?.on('error', () => {});
      child.stdin?.end(prompt);
      if (signal?.aborted) onAbort();
    });
  }

  private spawnError(e: unknown): LocalProviderError {
    const code = (e as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'EACCES') {
      return new LocalProviderError('cli_missing', 'The Claude Code CLI is not installed or not executable.');
    }
    return new LocalProviderError('cli_error', 'Failed to start the Claude Code CLI.');
  }
}
