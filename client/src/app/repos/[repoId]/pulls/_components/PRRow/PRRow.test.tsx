import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
// RunCostBadge in the cost cell reads the `runs` namespace.
import runsMessages from "../../../../../../../messages/en/runs.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "reviewed",
    opened_at: null,
    updated_at: "2026-06-11T18:44:34.000Z",
    score: 61,
    cost_usd: null,
    findings: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
    ...o,
  };
}

function renderRow(row: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, runs: runsMessages }}>
        <PRRow pr={row} repoId="repo-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the formatted cost for a reviewed PR", () => {
    renderRow(pr({ cost_usd: 0.05 }));
    expect(screen.getByText("$0.05")).toBeInTheDocument();
  });

  it("shows a dash when the PR has no runs yet", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PRRow — findings cell", () => {
  it("renders a badge with the count for each nonzero severity", () => {
    renderRow(pr({ findings: { CRITICAL: 2, WARNING: 4, SUGGESTION: 3 } }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("omits badges for severities with a zero count", () => {
    renderRow(pr({ findings: { CRITICAL: 0, WARNING: 5, SUGGESTION: 0 } }));
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows a dash when the PR has never been reviewed", () => {
    renderRow(pr({ cost_usd: 0.05, findings: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it('shows "None" when the latest review found nothing (distinct from never-reviewed)', () => {
    renderRow(pr({ cost_usd: 0.05, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }));
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
