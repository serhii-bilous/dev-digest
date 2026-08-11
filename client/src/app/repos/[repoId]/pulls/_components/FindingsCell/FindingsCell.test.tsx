import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";
import * as reviewsHooks from "@/lib/hooks/reviews";

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.mocked(reviewsHooks.usePrReviews).mockReturnValue({
    data: undefined,
    isLoading: false,
  } as unknown as ReturnType<typeof reviewsHooks.usePrReviews>);
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 1,
    title: "t",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "sha",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "reviewed",
    opened_at: null,
    updated_at: null,
    score: 80,
    cost_usd: null,
    findings: null,
    ...o,
  };
}

function renderCell(row: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsCell pr={row} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingsCell", () => {
  it("shows a dash and no hover target when never reviewed", () => {
    renderCell(pr({ findings: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it('shows "None" and no hover target when reviewed but clean', () => {
    renderCell(pr({ findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }));
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("renders a badge per non-zero severity behind a hoverable group", () => {
    renderCell(pr({ findings: { CRITICAL: 2, WARNING: 0, SUGGESTION: 1 } }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("fetches reviews lazily, only after the hover-open delay elapses", () => {
    vi.useFakeTimers();
    renderCell(pr({ findings: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    expect(reviewsHooks.usePrReviews).toHaveBeenLastCalledWith("pr-1", { enabled: false });

    fireEvent.mouseEnter(screen.getByRole("group"));
    expect(reviewsHooks.usePrReviews).toHaveBeenLastCalledWith("pr-1", { enabled: false });

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(reviewsHooks.usePrReviews).toHaveBeenLastCalledWith("pr-1", { enabled: true });
  });
});
