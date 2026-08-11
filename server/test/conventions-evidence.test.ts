import { describe, it, expect } from 'vitest';
import { verifyConventionEvidence } from '../src/modules/conventions/evidence.js';
import type { RawConventionCandidate } from '../src/modules/conventions/types.js';

/**
 * Evidence verification gate for extracted convention candidates — the
 * conventions-module analogue of reviewer-core's `groundFindings`, but
 * checking full-file content instead of diff hunks. See evidence.ts.
 */

const FILE_A = 'src/api/users.ts';
const FILE_A_CONTENT = [
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
  '',
].join('\n'); // 5 lines (trailing blank)

function candidate(overrides: Partial<RawConventionCandidate> = {}): RawConventionCandidate {
  return {
    category: 'error-handling',
    rule: 'Always use async/await instead of .then() chains.',
    evidence_path: FILE_A,
    evidence_line_start: 1,
    evidence_line_end: 2,
    confidence: 0.9,
    ...overrides,
  };
}

describe('verifyConventionEvidence', () => {
  it('keeps a candidate whose file+line range exists, and replaces its snippet with real file content', () => {
    const sampled = new Map([[FILE_A, FILE_A_CONTENT]]);
    const { kept, dropped } = verifyConventionEvidence([candidate()], sampled);

    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidence_snippet).toBe(
      'export async function getUser(id: string) {\n  const user = await db.users.find(id);',
    );
  });

  it('drops a candidate citing a file that was not sampled', () => {
    const sampled = new Map([[FILE_A, FILE_A_CONTENT]]);
    const { kept, dropped } = verifyConventionEvidence(
      [candidate({ evidence_path: 'src/not-sampled.ts' })],
      sampled,
    );

    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toContain('not sampled');
  });

  it('drops a candidate whose line range is out of bounds for the real file', () => {
    const sampled = new Map([[FILE_A, FILE_A_CONTENT]]);
    const { kept, dropped } = verifyConventionEvidence(
      [candidate({ evidence_line_start: 40, evidence_line_end: 45 })],
      sampled,
    );

    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toContain('out of range');
  });

  it('drops a candidate whose line range is an implausibly large span', () => {
    const bigFile = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    const sampled = new Map([[FILE_A, bigFile]]);
    const { kept, dropped } = verifyConventionEvidence(
      [candidate({ evidence_line_start: 1, evidence_line_end: 80 })],
      sampled,
    );

    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toContain('exceeds');
  });

  it('normalizes a reversed line range (end before start)', () => {
    const sampled = new Map([[FILE_A, FILE_A_CONTENT]]);
    const { kept } = verifyConventionEvidence(
      [candidate({ evidence_line_start: 2, evidence_line_end: 1 })],
      sampled,
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidence_line_start).toBe(1);
    expect(kept[0]!.evidence_line_end).toBe(2);
  });

  it('drops a candidate whose cited lines are blank', () => {
    const withBlank = 'real code\n\n\nmore code';
    const sampled = new Map([[FILE_A, withBlank]]);
    const { kept, dropped } = verifyConventionEvidence(
      [candidate({ evidence_line_start: 2, evidence_line_end: 3 })],
      sampled,
    );

    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toContain('blank');
  });
});
