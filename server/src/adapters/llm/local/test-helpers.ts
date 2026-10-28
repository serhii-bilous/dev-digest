import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import type { SpawnFn } from './cli-runner.js';

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8').trim();
}

export class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { end: (d: string) => { this.input = d; } });
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  input = '';
  kills: string[] = [];
  /** SIGTERM is ignored when true (forces SIGKILL path). */
  stubborn = false;
  kill(sig: NodeJS.Signals = 'SIGTERM') {
    this.kills.push(sig);
    if (sig === 'SIGKILL' || !this.stubborn) this.finish(null, sig);
    return true;
  }
  finish(code: number | null, sig: NodeJS.Signals | null = null, out = '', err = '') {
    if (out) this.stdout.emit('data', Buffer.from(out));
    if (err) this.stderr.emit('data', Buffer.from(err));
    this.exitCode = code;
    this.signalCode = sig;
    this.emit('close', code, sig);
  }
}

export interface Spawned { child: FakeChild; args: string[]; env: Record<string, string>; cwd: string }

/** Fake spawn: `script` decides what each child does (or nothing → hangs). */
export function fakeSpawn(script?: (c: FakeChild, n: number) => void) {
  const spawned: Spawned[] = [];
  const spawn: SpawnFn = (_cmd, args, opts) => {
    const child = new FakeChild();
    spawned.push({ child, args, env: opts.env, cwd: opts.cwd });
    const n = spawned.length;
    if (script) setImmediate(() => script(child, n));
    return child as unknown as ChildProcess;
  };
  return { spawn, spawned };
}

/** Poll with real setImmediate (works while setTimeout is faked). */
export async function until(cond: () => boolean, max = 200): Promise<void> {
  for (let i = 0; i < max && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error('until: condition not met');
}
