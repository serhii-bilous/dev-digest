import { describe, it, expect } from 'vitest';
import { gradeEvalCase } from '../src/modules/evals/grading.js';

describe('gradeEvalCase', () => {
  it('passes on an exact multiset match', () => {
    const expected = [{ severity: 'CRITICAL' as const, category: 'security' as const }];
    const actual = [{ severity: 'CRITICAL' as const, category: 'security' as const }];
    const result = gradeEvalCase(expected, actual, { kept: 1, dropped: 0 }, 100, 0.01);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.pass).toBe(true);
    expect(result.citation_accuracy).toBe(1);
  });

  it('fails on a count mismatch (expected 1, got 0)', () => {
    const expected = [{ severity: 'WARNING' as const, category: 'bug' as const }];
    const result = gradeEvalCase(expected, [], { kept: 0, dropped: 0 }, 50, null);
    expect(result.recall).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('fails when there are extra unexpected findings (over-triggering)', () => {
    const expected = [{ severity: 'CRITICAL' as const, category: 'security' as const }];
    const actual = [
      { severity: 'CRITICAL' as const, category: 'security' as const },
      { severity: 'WARNING' as const, category: 'style' as const },
    ];
    const result = gradeEvalCase(expected, actual, { kept: 2, dropped: 0 }, 50, null);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(0.5);
    expect(result.pass).toBe(false);
  });

  it('passes on an empty-expected case with zero actual findings ("clean" case)', () => {
    const result = gradeEvalCase([], [], { kept: 0, dropped: 0 }, 20, 0);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('fails on an empty-expected case that DID find something', () => {
    const actual = [{ severity: 'SUGGESTION' as const, category: 'style' as const }];
    const result = gradeEvalCase([], actual, { kept: 1, dropped: 0 }, 20, 0);
    expect(result.precision).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('citation_accuracy is 1 when nothing was found at all (no grounding denominator)', () => {
    const result = gradeEvalCase([], [], { kept: 0, dropped: 0 }, 10, null);
    expect(result.citation_accuracy).toBe(1);
  });

  it('citation_accuracy reflects the grounding gate kept/(kept+dropped) ratio', () => {
    const expected = [{ severity: 'CRITICAL' as const, category: 'security' as const }];
    const actual = [{ severity: 'CRITICAL' as const, category: 'security' as const }];
    const result = gradeEvalCase(expected, actual, { kept: 1, dropped: 1 }, 10, null);
    expect(result.citation_accuracy).toBe(0.5);
  });

  it('does not double-count a matched pair against a second identical expected item', () => {
    // Two expected CRITICAL/security, only one actual — recall should be 0.5, not 1.
    const expected = [
      { severity: 'CRITICAL' as const, category: 'security' as const },
      { severity: 'CRITICAL' as const, category: 'security' as const },
    ];
    const actual = [{ severity: 'CRITICAL' as const, category: 'security' as const }];
    const result = gradeEvalCase(expected, actual, { kept: 1, dropped: 0 }, 10, null);
    expect(result.recall).toBe(0.5);
    expect(result.precision).toBe(1);
    expect(result.pass).toBe(false);
  });
});
