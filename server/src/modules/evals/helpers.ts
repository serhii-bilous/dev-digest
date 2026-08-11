import type { EvalCase, EvalOwnerKind, EvalRunRecord } from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow } from './repository.js';

/** Pure DTO mappers for the evals module. No I/O. */

export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
  };
}

export function toEvalRunDto(row: EvalRunRow, caseName?: string): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName ?? null,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}
