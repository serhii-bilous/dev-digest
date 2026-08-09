import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";

const STATS: SkillStats = {
  skill_id: "sk1",
  skill_name: "secret-leakage-gate",
  agent_count: 3,
  pull_rate: 0.71,
  accept_rate: 0.74,
  findings_30d: 96,
  findings_by_category: [
    { category: "security", cost_usd: 52 },
    { category: "bug", cost_usd: 20 },
  ],
  agents: [
    { agent_id: "ag1", agent_name: "Security Reviewer" },
    { agent_id: "ag2", agent_name: "Performance Reviewer" },
  ],
};

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: STATS, isLoading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "x",
  type: "security",
  source: "manual",
  body: "x",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Skill StatsTab (smoke)", () => {
  it("renders the KPI tiles and the agents-using-this-skill list", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("Used by")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    expect(screen.getAllByText("Open")).toHaveLength(2);
  });
});
