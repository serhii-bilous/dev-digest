import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

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
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "summary",
    score: 61,
    model: "gpt",
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

function renderAccordion(r: ReviewRecord) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion review={r} prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — header findings", () => {
  it("renders severity badges with this run's own counts, not a plain-text string", () => {
    renderAccordion(
      review({
        findings: [
          finding({ id: "f1", severity: "CRITICAL" }),
          finding({ id: "f2", severity: "WARNING" }),
          finding({ id: "f3", severity: "WARNING" }),
        ],
      }),
    );
    expect(screen.getByText("1")).toBeInTheDocument(); // CRITICAL count
    expect(screen.getByText("2")).toBeInTheDocument(); // WARNING count
    expect(screen.queryByText(/^\d+ findings?/)).not.toBeInTheDocument();
  });

  it('shows "None" and no hoverable group when the run found nothing', () => {
    renderAccordion(review({ findings: [] }));
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("keeps blockers as a separate, non-dismissed-only count next to the badges", () => {
    renderAccordion(
      review({
        findings: [finding({ id: "f1", severity: "CRITICAL", dismissed_at: "2026-01-01T00:00:00.000Z" })],
      }),
    );
    // The badge still counts the dismissed critical (findings behind it)…
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    // …but the separate blockers text excludes dismissed findings, so it's absent.
    expect(screen.queryByText(/blocker/)).not.toBeInTheDocument();
  });

  it("the header's hover target is present while the accordion is collapsed", () => {
    renderAccordion(review({ findings: [finding({ id: "f1", severity: "CRITICAL" })] }));
    const group = screen.getByRole("group");
    fireEvent.mouseEnter(group);
    // Collapsed accordions render no body — hovering the header doesn't
    // require expanding it first.
    expect(screen.queryByText("summary")).not.toBeInTheDocument();
  });
});
