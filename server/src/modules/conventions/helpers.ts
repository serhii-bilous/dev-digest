import type { ConventionCandidate, ConventionCategory, ConventionScan } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './repository.js';

/** Map a persisted `conventions` row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: (row.category as ConventionCategory) ?? 'other',
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line_start: row.evidenceLineStart ?? 0,
    evidence_line_end: row.evidenceLineEnd ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

/** Map the latest `convention_scans` row (or none) to the public `ConventionScan` DTO. */
export function toScanDto(repoId: string, row: ConventionScanRow | undefined): ConventionScan {
  return {
    repo_id: repoId,
    sample_file_count: row?.sampleFileCount ?? 0,
    candidate_count: row?.candidateCount ?? 0,
    scanned_at: row?.scannedAt.toISOString() ?? null,
  };
}
