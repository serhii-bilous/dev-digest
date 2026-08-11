import type { EvalCaseWithLatestRun, FindingCategory, Severity } from "@devdigest/shared";

export interface ExpectedRow {
  severity: Severity;
  category: FindingCategory;
}

/** `expected_output`/`actual_output` are `unknown` at the DTO boundary —
 *  parse defensively rather than trusting the shape. */
export function parseFindingDescriptors(value: unknown): ExpectedRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is ExpectedRow => !!v && typeof v === "object" && "severity" in v && "category" in v,
  );
}

export type CaseStatus = "pass" | "fail" | "never-run";

export function caseStatus(evalCase: EvalCaseWithLatestRun): CaseStatus {
  if (!evalCase.latest_run) return "never-run";
  return evalCase.latest_run.pass ? "pass" : "fail";
}
