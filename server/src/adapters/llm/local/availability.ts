import { execFile } from 'node:child_process';
import type { LocalStatus } from '@devdigest/shared';

export const VERSION_RE = /^(\d+\.\d+\.\d+) \(Claude Code\)/;

export interface ExecResult {
  stdout: string;
  exitCode: number | null;
}
export type ExecFn = (cmd: string, args: string[], opts: { timeoutMs: number }) => Promise<ExecResult>;

/** Default exec: bare PATH-only env, never sends a model call. */
export function makeDefaultExec(pathEnv: string): ExecFn {
  return (cmd, args, { timeoutMs }) =>
    new Promise((resolve) => {
      execFile(
        cmd,
        args,
        { timeout: timeoutMs, env: { PATH: pathEnv }, windowsHide: true },
        (err, stdout) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException & { code?: unknown }).code;
            resolve({ stdout: String(stdout ?? ''), exitCode: typeof code === 'number' ? code : null });
          } else resolve({ stdout: String(stdout), exitCode: 0 });
        },
      );
    });
}

export interface ProbeOptions {
  cliPath: string;
  /** Extra leading args (tests run the stub through `node`). */
  cliArgsPrefix?: string[];
  exec: ExecFn;
  /** DevDigest secrets only — a host login never counts (AC-4). */
  getToken: () => Promise<string | undefined> | string | undefined;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

/** Returns a probe: `--version` check (cached ≤10 s) + token presence. No model call. */
export function createProbe(opts: ProbeOptions): () => Promise<LocalStatus> {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? 10_000;
  let cached: { version: string | null; at: number } | undefined;

  async function cliVersion(): Promise<string | null> {
    if (cached && now() - cached.at < ttl) return cached.version;
    let version: string | null = null;
    try {
      const r = await opts.exec(opts.cliPath, [...(opts.cliArgsPrefix ?? []), '--version'], {
        timeoutMs: opts.timeoutMs ?? 2000,
      });
      const m = r.exitCode === 0 ? VERSION_RE.exec(r.stdout.trim()) : null;
      version = m ? m[1]! : null;
    } catch {
      version = null;
    }
    cached = { version, at: now() };
    return version;
  }

  return async () => {
    const version = await cliVersion();
    const token = await opts.getToken();
    const token_configured = typeof token === 'string' && token.length > 0;
    if (!version) return { available: false, reason: 'cli_missing', token_configured };
    if (!token_configured) {
      return { available: false, reason: 'token_missing', cli_version: version, token_configured };
    }
    return { available: true, cli_version: version, token_configured };
  };
}
