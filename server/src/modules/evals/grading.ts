import type { Severity, FindingCategory } from '@devdigest/shared';

/**
 * Eval grading — pure, hermetically testable. No DB/LLM.
 *
 * Grading semantics (undocumented anywhere in the repo prior to this — this
 * IS the spec, not just an implementation of one):
 *
 * - `expected`/`actual` are order-independent multisets of {severity,
 *   category} descriptors (an eval case doesn't pin exact file:line, just
 *   the SHAPE of finding it expects). `[]` means "expect zero findings".
 * - Matching is a greedy multiset intersection on severity+category pairs,
 *   no reuse of a matched item.
 * - `recall` = fraction of expected items that were matched (1 when nothing
 *   was expected — vacuously recalled).
 * - `precision` = fraction of actual items that were expected (1 when
 *   nothing was expected AND nothing was found; 0 when something was found
 *   but nothing was expected).
 * - `pass` = exact multiset match (`recall === 1 && precision === 1`).
 * - `citation_accuracy` is NOT fabricated — it's read straight off
 *   reviewer-core's own citation-grounding gate: kept / (kept + dropped),
 *   1 when nothing was found at all.
 */

export interface FindingDescriptor {
  severity: Severity;
  category: FindingCategory;
}

export interface GradingResult {
  recall: number;
  precision: number;
  citation_accuracy: number;
  pass: boolean;
  duration_ms: number;
  cost_usd: number | null;
}

function key(d: FindingDescriptor): string {
  return `${d.severity}:${d.category}`;
}

/** Greedy multiset-intersection size between expected and actual descriptors. */
function matchCount(expected: FindingDescriptor[], actual: FindingDescriptor[]): number {
  const remaining = new Map<string, number>();
  for (const a of actual) remaining.set(key(a), (remaining.get(key(a)) ?? 0) + 1);
  let matched = 0;
  for (const e of expected) {
    const k = key(e);
    const n = remaining.get(k) ?? 0;
    if (n > 0) {
      matched++;
      remaining.set(k, n - 1);
    }
  }
  return matched;
}

export function gradeEvalCase(
  expected: FindingDescriptor[],
  actual: FindingDescriptor[],
  grounding: { kept: number; dropped: number },
  durationMs: number,
  costUsd: number | null,
): GradingResult {
  const matched = matchCount(expected, actual);
  const recall = expected.length === 0 ? 1 : matched / expected.length;
  const precision =
    actual.length === 0 ? (expected.length === 0 ? 1 : 0) : matched / actual.length;
  const total = grounding.kept + grounding.dropped;
  const citation_accuracy = total === 0 ? 1 : grounding.kept / total;
  return {
    recall,
    precision,
    citation_accuracy,
    pass: recall === 1 && precision === 1,
    duration_ms: durationMs,
    cost_usd: costUsd,
  };
}
