import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "./helpers";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "secret-leakage-gate",
    description: "Flags hardcoded secrets.",
    type: "security",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
  },
  {
    id: "sk2",
    name: "test-coverage-nudge",
    description: "Pushes for happy-path tests.",
    type: "convention",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
  },
];

describe("filterSkills", () => {
  it("returns all skills when search is empty", () => {
    expect(filterSkills(SKILLS, "")).toEqual(SKILLS);
  });

  it("returns all skills when search is whitespace-only", () => {
    expect(filterSkills(SKILLS, "   ")).toEqual(SKILLS);
  });

  it("matches case-insensitively against name", () => {
    expect(filterSkills(SKILLS, "SECRET-leakage")).toEqual([SKILLS[0]]);
  });

  it("matches case-insensitively against description", () => {
    expect(filterSkills(SKILLS, "happy-path")).toEqual([SKILLS[1]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSkills(SKILLS, "no-such-skill")).toEqual([]);
  });
});
