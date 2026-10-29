import { describe, it, expect, vi } from 'vitest';
import { RunBus } from './sse.js';

describe('RunBus cancel hooks (Local cancel, AC-31)', () => {
  it('cancel() invokes registered callbacks once and marks the run cancelled', () => {
    const bus = new RunBus();
    const cb = vi.fn();
    bus.onCancel('r1', cb);
    bus.cancel('r1');
    bus.cancel('r1');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(bus.isCancelled('r1')).toBe(true);
  });

  it('complete() clears callbacks so a later cancel does not fire them', () => {
    const bus = new RunBus();
    const cb = vi.fn();
    bus.onCancel('r2', cb);
    bus.complete('r2');
    bus.cancel('r2');
    expect(cb).not.toHaveBeenCalled();
  });

  it('unregister removes a callback; hooks are per-run', () => {
    const bus = new RunBus();
    const a = vi.fn();
    const b = vi.fn();
    const off = bus.onCancel('r3', a);
    bus.onCancel('r4', b);
    off();
    bus.cancel('r3');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('a throwing callback does not block the others', () => {
    const bus = new RunBus();
    const ok = vi.fn();
    bus.onCancel('r5', () => {
      throw new Error('boom');
    });
    bus.onCancel('r5', ok);
    expect(() => bus.cancel('r5')).not.toThrow();
    expect(ok).toHaveBeenCalled();
  });

  it('onCancel on an already-cancelled run fires immediately', () => {
    const bus = new RunBus();
    bus.cancel('r6');
    const cb = vi.fn();
    bus.onCancel('r6', cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
