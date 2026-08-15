/** Findings-to-diff-line helpers for FileCard's Smart Diff badge/tags. Kept
 *  local to diff-viewer rather than importing the page-scoped FindingsPanel
 *  helper of the same name. */
import type { FindingRecord, Severity, SeverityCounts } from "@devdigest/shared";
import type { Line } from "./helpers";

export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) c[f.severity] += 1;
  return c;
}

/** Severities of findings whose start_line matches this line's new-side number. */
export function severitiesForLine(ln: Line, findings: FindingRecord[]): Severity[] {
  if (ln.newNo == null) return [];
  return findings.filter((f) => f.start_line === ln.newNo).map((f) => f.severity);
}
