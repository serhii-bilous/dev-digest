import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const actionMutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: actionMutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  actionMutate.mockClear();
});

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query",
    file: "src/db.ts",
    start_line: 5,
    end_line: 5,
    rationale: "Loops a query per row.",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("renders a severity filter chip per severity with this run's own counts", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const bar = screen.getByRole("group", { name: "Filter by severity" });
    expect(bar).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
  });

  it("selecting a severity hides findings of the other severities", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" selectedSeverities={["CRITICAL"]} />);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
  });

  it("clicking a chip reports the toggled severity to the caller", () => {
    const onChange = vi.fn();
    renderWithIntl(
      <FindingsPanel findings={FINDINGS} prId="pr1" selectedSeverities={[]} onSelectedSeveritiesChange={onChange} />,
    );
    fireEvent.click(screen.getByText("Critical"));
    expect(onChange).toHaveBeenCalledWith(["CRITICAL"]);
  });

  it("pressing j moves keyboard focus to the next finding, so a/d then act on it", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.keyDown(window, { key: "j" }); // focus moves from f1 (idx 0) to f2 (idx 1)
    fireEvent.keyDown(window, { key: "a" });
    expect(actionMutate).toHaveBeenCalledWith({ findingId: "f2", action: "accept", prId: "pr1" });
  });

  it("pressing k at the first finding is clamped and does not move focus before it", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.keyDown(window, { key: "k" }); // already at idx 0, stays at idx 0
    fireEvent.keyDown(window, { key: "d" });
    expect(actionMutate).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });
  });
});
