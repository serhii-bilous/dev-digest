import { abortError } from './errors.js';

export interface SlotAcquire {
  runId?: string;
  signal?: AbortSignal;
  onQueued?: () => void;
}

export interface SlotLease {
  release: () => void;
  queuedMs: number;
}

interface Waiter {
  runId?: string;
  enqueuedAt: number;
  grant: () => void;
}

/** FIFO counting semaphore (process-wide cap on concurrent Local CLI calls). */
export class LocalSlotGate {
  private active = 0;
  private waiters: Waiter[] = [];

  constructor(
    private readonly max = 2,
    private readonly now: () => number = Date.now,
  ) {}

  get inFlight(): number {
    return this.active;
  }

  isQueued(runId: string): boolean {
    return this.waiters.some((w) => w.runId === runId);
  }

  acquire(opts: SlotAcquire = {}): Promise<SlotLease> {
    const { runId, signal, onQueued } = opts;
    if (signal?.aborted) return Promise.reject(abortError());
    const start = this.now();
    if (this.active < this.max && this.waiters.length === 0) {
      this.active++;
      return Promise.resolve(this.lease(0));
    }
    return new Promise<SlotLease>((resolve, reject) => {
      const waiter: Waiter = {
        runId,
        enqueuedAt: start,
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          this.active++;
          resolve(this.lease(this.now() - start));
        },
      };
      const onAbort = () => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
      onQueued?.();
    });
  }

  private lease(queuedMs: number): SlotLease {
    let released = false;
    return {
      queuedMs,
      release: () => {
        if (released) return;
        released = true;
        this.active--;
        const next = this.waiters.shift();
        if (next) next.grant();
      },
    };
  }
}
