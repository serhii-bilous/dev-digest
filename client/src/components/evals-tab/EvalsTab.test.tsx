import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseWithLatestRun } from "@devdigest/shared";
import messages from "../../../messages/en/evalCases.json";
import { ToastProvider } from "@/lib/toast";

const CASES: EvalCaseWithLatestRun[] = [
  {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "stripe-key-leak",
    input_diff: "d",
    input_files: null,
    input_meta: null,
    expected_output: [{ severity: "CRITICAL", category: "security" }],
    notes: null,
    latest_run: {
      id: "r1",
      case_id: "c1",
      case_name: "stripe-key-leak",
      ran_at: "2026-01-01T00:00:00Z",
      actual_output: [{ severity: "CRITICAL", category: "security" }],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 100,
      cost_usd: 0.01,
    },
  },
  {
    id: "c2",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "missing-retry-after",
    input_diff: "d",
    input_files: null,
    input_meta: null,
    expected_output: [{ severity: "WARNING", category: "bug" }],
    notes: null,
    latest_run: {
      id: "r2",
      case_id: "c2",
      case_name: "missing-retry-after",
      ran_at: "2026-01-01T00:00:00Z",
      actual_output: [],
      pass: false,
      recall: 0,
      precision: 0,
      citation_accuracy: 1,
      duration_ms: 80,
      cost_usd: 0,
    },
  },
  {
    id: "c3",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "clean-refactor-no-flags",
    input_diff: "d",
    input_files: null,
    input_meta: null,
    expected_output: [],
    notes: null,
    latest_run: null,
  },
];

const deleteMutate = vi.fn();
vi.mock("@/lib/hooks/evals", () => ({
  useEvals: () => ({ data: CASES, isLoading: false }),
  useEvalsSummary: () => ({ data: { total: 3, passing: 1 } }),
  useDeleteEvalCase: () => ({ mutate: deleteMutate, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRunAllEvalCases: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);
beforeEach(() => deleteMutate.mockClear());

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evalCases: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("EvalsTab (smoke)", () => {
  it("renders the passing summary and every case name", () => {
    renderWithIntl(<EvalsTab ownerKind="agent" ownerId="ag1" />);
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("missing-retry-after")).toBeInTheDocument();
    expect(screen.getByText("clean-refactor-no-flags")).toBeInTheDocument();
  });

  it("shows expected/got for a run case and 'never run' for one with no run", () => {
    renderWithIntl(<EvalsTab ownerKind="agent" ownerId="ag1" />);
    expect(screen.getByText("expected 1 finding(s), got 1")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
  });

  it("shows the empty-brackets badge for a case with no expected findings", () => {
    renderWithIntl(<EvalsTab ownerKind="agent" ownerId="ag1" />);
    expect(screen.getByText("empty []")).toBeInTheDocument();
  });

  it("deletes a case after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(<EvalsTab ownerKind="agent" ownerId="ag1" />);
    const deleteButtons = screen.getAllByLabelText("Delete");
    fireEvent.click(deleteButtons[0]!);
    expect(deleteMutate).toHaveBeenCalledWith({ id: "c1", ownerKind: "agent", ownerId: "ag1" });
    vi.restoreAllMocks();
  });
});
