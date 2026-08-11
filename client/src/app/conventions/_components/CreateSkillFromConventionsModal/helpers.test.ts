import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildSkillBodyFromConventions, repoSlug, uniqueEvidenceFiles } from "./helpers";

const CANDIDATES: ConventionCandidate[] = [
  {
    id: "c1",
    category: "error-handling",
    rule: "Always use async/await instead of .then() chains.",
    evidence_path: "src/api/users.ts",
    evidence_line_start: 23,
    evidence_line_end: 31,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: true,
  },
  {
    id: "c2",
    category: "api-design",
    rule: "All public route handlers return typed Result<T, ApiError>.",
    evidence_path: "src/api/public/index.ts",
    evidence_line_start: 14,
    evidence_line_end: 14,
    evidence_snippet: "function handler(): Result<Item[], ApiError> {",
    confidence: 0.78,
    accepted: true,
  },
];

describe("repoSlug", () => {
  it("takes the last path segment and kebab-cases it", () => {
    expect(repoSlug("acme/payments-api")).toBe("payments-api");
  });

  it("falls back to the input when there is no slash", () => {
    expect(repoSlug("Payments API")).toBe("payments-api");
  });
});

describe("buildSkillBodyFromConventions", () => {
  it("renders a heading, framing sentence, and one section per candidate", () => {
    const body = buildSkillBodyFromConventions(CANDIDATES, "acme/payments-api");
    expect(body).toContain("# payments-api-conventions");
    expect(body).toContain("House conventions for `acme/payments-api`");
    expect(body).toContain("## Always use async/await instead of .then() chains.");
    expect(body).toContain("Detected in `src/api/users.ts:23-31`:");
    expect(body).toContain("## All public route handlers return typed Result<T, ApiError>.");
    expect(body).toContain("Detected in `src/api/public/index.ts:14`:");
  });

  it("returns just the heading + framing sentence for an empty candidate list", () => {
    const body = buildSkillBodyFromConventions([], "acme/payments-api");
    expect(body).toBe(
      "# payments-api-conventions\n\nHouse conventions for `acme/payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.",
    );
  });
});

describe("uniqueEvidenceFiles", () => {
  it("dedupes evidence paths across candidates", () => {
    const dup = [...CANDIDATES, { ...CANDIDATES[0]!, id: "c3" }];
    expect(uniqueEvidenceFiles(dup)).toEqual(["src/api/users.ts", "src/api/public/index.ts"]);
  });
});
