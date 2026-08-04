import type { FindingRecord, Severity, SeverityCounts } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/**
 * Drop low-confidence findings, then filter to the selected severities, then
 * sort. That order matters: a chip's count is exactly the row count you get
 * by selecting that chip alone, so it has to move with the confidence toggle
 * and never with the severity selection itself.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  selected: Severity[] = [],
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (selected.length > 0) shown = shown.filter((f) => selected.includes(f.severity));
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Per-severity tally, shared by sites 1/3/4 so none of them can drift. */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) c[f.severity] += 1;
  return c;
}
