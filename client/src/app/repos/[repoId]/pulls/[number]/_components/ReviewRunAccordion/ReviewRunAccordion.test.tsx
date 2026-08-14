import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const deleteMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: deleteMutate, isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

// jsdom doesn't implement scrollIntoView — the auto-open effect calls it.
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

function renderAccordion(r: ReviewRecord, extraProps: Partial<React.ComponentProps<typeof ReviewRunAccordion>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion review={r} prId="pr1" {...extraProps} />
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

describe("ReviewRunAccordion — targetRunId auto-open", () => {
  it("auto-opens and scrolls into view when targetRunId matches this run's run_id", () => {
    renderAccordion(review({ run_id: "run1" }), { targetRunId: "run1" });
    // Body (VerdictBanner summary) only renders while open.
    expect(screen.getByText("summary")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("stays collapsed when targetRunId does not match this run's run_id", () => {
    renderAccordion(review({ run_id: "run1" }), { targetRunId: "some-other-run" });
    expect(screen.queryByText("summary")).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("ReviewRunAccordion — delete run", () => {
  it("deletes the run when the user confirms the prompt", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderAccordion(review({ id: "r1", agent_name: "Security Reviewer" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete this review run" }));

    expect(window.confirm).toHaveBeenCalledWith('Delete this "Security Reviewer" review run and its findings?');
    expect(deleteMutate).toHaveBeenCalledWith("r1");
  });

  it("does not delete the run when the user cancels the prompt", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderAccordion(review({ id: "r1" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete this review run" }));

    expect(deleteMutate).not.toHaveBeenCalled();
  });
});
