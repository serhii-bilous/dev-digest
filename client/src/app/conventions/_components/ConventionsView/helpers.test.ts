import { describe, it, expect } from "vitest";
import { DEFAULT_BRANCH_VALUE, findPrBranch, parsePrSelection } from "./helpers";

describe("parsePrSelection", () => {
  it("returns null for the default-branch sentinel", () => {
    expect(parsePrSelection(DEFAULT_BRANCH_VALUE)).toBeNull();
  });

  it("parses a PR number string into a number", () => {
    expect(parsePrSelection("482")).toBe(482);
  });

  it("falls back to null for an unparseable value", () => {
    expect(parsePrSelection("not-a-number")).toBeNull();
  });
});

describe("findPrBranch", () => {
  const pulls = [
    { number: 482, branch: "feat/rate-limit" },
    { number: 501, branch: "fix/leak" },
  ];

  it("returns undefined when no PR is selected", () => {
    expect(findPrBranch(pulls, null)).toBeUndefined();
    expect(findPrBranch(pulls, undefined)).toBeUndefined();
  });

  it("returns the matching PR's branch", () => {
    expect(findPrBranch(pulls, 501)).toBe("fix/leak");
  });

  it("returns undefined for an unknown PR number", () => {
    expect(findPrBranch(pulls, 9999)).toBeUndefined();
  });
});
