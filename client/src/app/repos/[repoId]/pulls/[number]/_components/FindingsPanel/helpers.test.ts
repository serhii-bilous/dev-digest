import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { visibleFindings, countBySeverity } from "./helpers";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f-1",
    review_id: "r-1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: null,
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

describe("visibleFindings", () => {
  const findings = [
    finding({ id: "c", severity: "CRITICAL", confidence: 0.9 }),
    finding({ id: "w-low", severity: "WARNING", confidence: 0.4 }),
    finding({ id: "s", severity: "SUGGESTION", confidence: 0.9 }),
  ];

  it("sorts worst-first with no filters applied", () => {
    expect(visibleFindings(findings, false).map((f) => f.id)).toEqual(["c", "w-low", "s"]);
  });

  it("drops low-confidence findings when hideLow is on", () => {
    expect(visibleFindings(findings, true).map((f) => f.id)).toEqual(["c", "s"]);
  });

  it("filters to the selected severities", () => {
    expect(visibleFindings(findings, false, ["CRITICAL"]).map((f) => f.id)).toEqual(["c"]);
  });

  it("applies the confidence filter before the severity selection", () => {
    // Selecting WARNING alone would normally show w-low; hideLow removes it first.
    expect(visibleFindings(findings, true, ["WARNING"])).toEqual([]);
  });

  it("treats an empty selection as no filter", () => {
    expect(visibleFindings(findings, false, [])).toHaveLength(3);
  });
});

describe("countBySeverity", () => {
  it("tallies findings into CRITICAL/WARNING/SUGGESTION buckets", () => {
    expect(
      countBySeverity([
        finding({ severity: "CRITICAL" }),
        finding({ severity: "CRITICAL" }),
        finding({ severity: "WARNING" }),
        finding({ severity: "SUGGESTION" }),
      ]),
    ).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("is all-zero for no findings", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});
