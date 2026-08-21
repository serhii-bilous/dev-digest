import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const deleteMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: deleteMutate, isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsTab } from "./FindingsTab";

// jsdom doesn't implement scrollIntoView — the auto-open/nav-target effects call it.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: "Some finding",
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

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Agent",
    kind: "review",
    verdict: "comment",
    summary: "summary",
    score: 90,
    model: "gpt",
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

const cancelMutation = { mutate: vi.fn(), isPending: false } as unknown as Parameters<
  typeof FindingsTab
>[0]["cancelMutation"];

function renderTab(props: Partial<React.ComponentProps<typeof FindingsTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        runs={[]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={cancelMutation}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTab — Smart Diff badge navigation", () => {
  it("resolves a target finding to its owning (non-first) run, opening + expanding its card", () => {
    const runs = [
      review({
        id: "r1",
        run_id: "run1",
        agent_name: "First Agent",
        findings: [finding({ id: "f1", review_id: "r1", title: "First run finding" })],
      }),
      review({
        id: "r2",
        run_id: "run2",
        agent_name: "Second Agent",
        findings: [finding({ id: "f2", review_id: "r2", title: "Target finding", rationale: "target rationale" })],
      }),
    ];
    renderTab({ runs, targetFindingId: "f2", targetFindingNonce: 1 });

    // Both accordions render collapsed by default (defaultOpen only for i===0)
    // — the second one must still auto-open because it owns the target finding.
    expect(screen.getByText("target rationale")).toBeInTheDocument();
  });

  it("does nothing when targetFindingId is null (no run forced open beyond the default)", () => {
    const runs = [
      review({ id: "r1", run_id: "run1", findings: [finding({ id: "f1", review_id: "r1", rationale: "r1 body" })] }),
      review({ id: "r2", run_id: "run2", findings: [finding({ id: "f2", review_id: "r2", rationale: "r2 body" })] }),
    ];
    renderTab({ runs, targetFindingId: null, targetFindingNonce: 0 });

    // Only the first run (defaultOpen) is expanded.
    expect(screen.queryByText("r2 body")).not.toBeInTheDocument();
  });
});
