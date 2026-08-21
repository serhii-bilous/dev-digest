import type { SmartDiffRole, ProposedSplit } from '@devdigest/shared';
import {
  LOCKFILE_BASENAMES,
  BOILERPLATE_DIR_SEGMENTS,
  BOILERPLATE_SUFFIXES,
  WIRING_BASENAME_PATTERNS,
  WIRING_DIR_SEGMENTS,
  SMART_DIFF_TOO_BIG_LINE_THRESHOLD,
  SMART_DIFF_MIN_SPLIT_GROUP_LINES,
  SMART_DIFF_MAX_PROPOSED_SPLITS,
} from './smart-diff-constants.js';

/**
 * Pure, deterministic file classifier — path/pattern rules only, no LLM and no
 * DB/network access, so it's directly unit-testable. Precedence: boilerplate
 * first (strongest signal), then wiring, everything else is core.
 */
export function classifyFile(path: string): SmartDiffRole {
  const segments = path.split('/');
  const basename = segments[segments.length - 1] ?? path;

  if (
    (LOCKFILE_BASENAMES as readonly string[]).includes(basename) ||
    segments.some((seg) => (BOILERPLATE_DIR_SEGMENTS as readonly string[]).includes(seg)) ||
    BOILERPLATE_SUFFIXES.some((suffix) => path.endsWith(suffix))
  ) {
    return 'boilerplate';
  }

  if (
    WIRING_BASENAME_PATTERNS.some((re) => re.test(basename)) ||
    segments.some((seg) => (WIRING_DIR_SEGMENTS as readonly string[]).includes(seg))
  ) {
    return 'wiring';
  }

  return 'core';
}

export type ClassifiedFile = {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
};

/**
 * Decide whether the PR is "too big to review comfortably" and, if so,
 * propose directory-based splits. Boilerplate churn (a lockfile bump, a
 * regenerated snapshot) is excluded from `total_lines` so it never inflates
 * a genuinely small logic change into a false "too big" verdict.
 */
export function buildSplitSuggestion(files: ClassifiedFile[]): {
  too_big: boolean;
  total_lines: number;
  proposed_splits: ProposedSplit[];
} {
  const reviewable = files.filter((f) => f.role !== 'boilerplate');
  const total_lines = reviewable.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const too_big = total_lines > SMART_DIFF_TOO_BIG_LINE_THRESHOLD;

  if (!too_big) {
    return { too_big, total_lines, proposed_splits: [] };
  }

  const groups = new Map<string, { lines: number; files: string[] }>();
  for (const f of reviewable) {
    const segments = f.path.split('/');
    const name = segments.slice(0, Math.min(2, segments.length)).join('/');
    const lines = f.additions + f.deletions;
    const existing = groups.get(name);
    if (existing) {
      existing.lines += lines;
      existing.files.push(f.path);
    } else {
      groups.set(name, { lines, files: [f.path] });
    }
  }

  const proposed_splits: ProposedSplit[] = [...groups.entries()]
    .filter(([, g]) => g.lines >= SMART_DIFF_MIN_SPLIT_GROUP_LINES)
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, SMART_DIFF_MAX_PROPOSED_SPLITS)
    .map(([name, g]) => ({ name, files: g.files }));

  return { too_big, total_lines, proposed_splits };
}
