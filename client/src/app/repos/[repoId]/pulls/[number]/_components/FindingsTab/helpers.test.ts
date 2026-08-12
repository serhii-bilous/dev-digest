import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { buildFindingsByRun } from "./helpers";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 1,
  end_line: 1,
  rationale: "x",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "General Reviewer",
    kind: "review",
    verdict: "comment",
    summary: "x",
    score: 90,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [FINDING],
    ...overrides,
  };
}

describe("buildFindingsByRun", () => {
  it("keys each review's findings by run_id", () => {
    const m = buildFindingsByRun([review({ run_id: "run1", findings: [FINDING] })]);
    expect(m.get("run1")).toEqual([FINDING]);
  });

  it("skips reviews with no run_id", () => {
    const m = buildFindingsByRun([review({ run_id: null })]);
    expect(m.size).toBe(0);
  });

  it("normalizes a nullish findings value to an empty array instead of undefined", () => {
    // Regression: a Map value of `undefined` makes `.has(run_id)` true while
    // `.get(run_id)` is undefined, which crashes RunHistory's `.length`
    // access despite its has()-then-get()! guard.
    const m = buildFindingsByRun([
      { ...review({ run_id: "run2" }), findings: undefined as unknown as FindingRecord[] },
    ]);
    expect(m.has("run2")).toBe(true);
    expect(m.get("run2")).toEqual([]);
  });
});
