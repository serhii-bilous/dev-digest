import { describe, it, expect } from 'vitest';
import { taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('queueTimeTracker (AC-47)', () => {
  it('sums queuedMs across calls and forwards each line', async () => {
    const { queueTimeTracker } = await import('../src/modules/reviews/helpers.js');
    const seen: unknown[] = [];
    const t = queueTimeTracker({ info: (o) => void seen.push(o) });
    expect(t.total()).toBeNull();
    t.logger.info({ queuedMs: 400_000 });
    t.logger.info({ queuedMs: 0 });
    t.logger.info({ other: 1 });
    expect(t.total()).toBe(400_000);
    expect(seen).toHaveLength(3);
  });
});
