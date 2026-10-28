import { describe, it, expect, vi } from 'vitest';
import { LocalSlotGate } from './slot-gate.js';

describe('LocalSlotGate (AC-36, AC-37, AC-38, AC-39)', () => {
  it('caps at 2, grants FIFO, reports queuedMs from the injected clock', async () => {
    let t = 0;
    const gate = new LocalSlotGate(2, () => t);
    const a = await gate.acquire({ runId: 'a' });
    await gate.acquire({ runId: 'b' });
    const onQueued = vi.fn();
    const c = gate.acquire({ runId: 'c', onQueued });
    const d = gate.acquire({ runId: 'd' });
    expect(onQueued).toHaveBeenCalledOnce();
    expect(gate.isQueued('c')).toBe(true);
    expect(gate.inFlight).toBe(2);
    t = 400_000;
    a.release();
    const lc = await c;
    expect(lc.queuedMs).toBe(400_000);
    expect(gate.isQueued('c')).toBe(false);
    expect(gate.isQueued('d')).toBe(true);
    expect(gate.inFlight).toBe(2);
    lc.release();
    (await d).release();
  });

  it('abort while queued removes the entry without taking a slot', async () => {
    const gate = new LocalSlotGate(1);
    const a = await gate.acquire({ runId: 'a' });
    const ac = new AbortController();
    const p = gate.acquire({ runId: 'b', signal: ac.signal });
    const next = gate.acquire({ runId: 'c' });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(gate.isQueued('b')).toBe(false);
    a.release();
    (await next).release();
    expect(gate.inFlight).toBe(0);
  });

  it('release is idempotent', async () => {
    const gate = new LocalSlotGate(1);
    const a = await gate.acquire();
    a.release();
    a.release();
    expect(gate.inFlight).toBe(0);
  });
});
