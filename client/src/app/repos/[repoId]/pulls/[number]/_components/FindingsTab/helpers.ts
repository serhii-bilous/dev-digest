import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/**
 * Join each run to its own findings, keyed by run_id, for the Timeline
 * (RunHistory) to look up. `r.findings` is typed as always-present, but a
 * value of `undefined` would still make `Map.has(run_id)` true — silently
 * defeating RunHistory's has()-then-get()! guard and throwing on `.length` —
 * so every entry is normalized to a real array.
 */
export function buildFindingsByRun(runs: ReviewRecord[]): Map<string, FindingRecord[]> {
  const m = new Map<string, FindingRecord[]>();
  for (const r of runs) if (r.run_id) m.set(r.run_id, r.findings ?? []);
  return m;
}
