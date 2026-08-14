import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const STATS: AgentStats = {
  agent_id: "ag1",
  agent_name: "Test Agent",
  runs: 5,
  findings_total: 3,
  accepted: 1,
  dismissed: 1,
  pending: 1,
  accept_rate: 0.5,
  dismiss_rate: 0.5,
  avg_findings_per_run: 0.6,
  total_cost_usd: 0.15,
  avg_cost_usd: 0.03,
  avg_latency_ms: 4200,
  findings_by_severity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 1 },
  trend: [
    { label: "2026-01-01", value: 1 },
    { label: "2026-01-02", value: 2 },
  ],
  avg_cost_usd_delta: -0.01,
  most_used_skills: [{ skill_id: "s1", name: "secret-leakage-gate", pct: 80 }],
  findings_by_severity_weekly: Array.from({ length: 6 }, (_, i) => ({
    label: `w${i + 1}`,
    critical: 0,
    warning: 0,
    suggestion: 0,
  })),
  findings_by_category: [{ category: "security", cost_usd: 0.02 }],
  run_history: [
    {
      run_id: "r1",
      agent_id: "ag1",
      agent_name: "Test Agent",
      provider: "openai",
      model: "gpt-4.1",
      status: "done",
      error: null,
      duration_ms: 3000,
      tokens_in: 100,
      tokens_out: 100,
      cost_usd: 0.02,
      findings_count: 2,
      grounding: "2/2 passed",
      ran_at: "2026-01-01T00:00:00Z",
      score: 80,
      blockers: 0,
      pr_number: 900,
      pr_title: "Stats PR",
      source: "local",
    },
  ],
};

let statsData: AgentStats = STATS;

vi.mock("../../../../../../../lib/hooks/stats", () => ({
  useAgentStats: () => ({ data: statsData, isLoading: false }),
}));

import { StatsTab } from "./StatsTab";

afterEach(() => {
  cleanup();
  statsData = STATS;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("StatsTab (smoke)", () => {
  it("renders the KPI tiles, most-used skills, and run history", () => {
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getByText("Total runs (30d)")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("#900")).toBeInTheDocument();
    expect(screen.getByText("View trace")).toBeInTheDocument();
  });

  it("renders the accept-rate gauge value", () => {
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("shows the empty-state copy for skills, category, and run history when none exist", () => {
    statsData = { ...STATS, most_used_skills: [], findings_by_category: [], run_history: [] };
    renderWithIntl(<StatsTab agentId="ag1" />);
    expect(screen.getByText("No skills were used in this window.")).toBeInTheDocument();
    expect(screen.getAllByText("No runs yet. Run a review with this agent to see stats here.")).toHaveLength(2);
    expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument();
    expect(screen.queryByText("View trace")).not.toBeInTheDocument();
  });
});
