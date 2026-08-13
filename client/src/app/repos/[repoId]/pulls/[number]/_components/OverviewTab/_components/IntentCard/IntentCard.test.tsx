import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import type { PrIntentRecord } from "@devdigest/shared";

const computeMutate = vi.fn();

let intentState: { data: PrIntentRecord | null | undefined; isLoading: boolean };
let computeState: { isPending: boolean };

vi.mock("../../../../../../../../../lib/hooks/intent", () => ({
  usePrIntent: () => intentState,
  useComputeIntent: () => ({ mutate: computeMutate, isPending: computeState.isPending }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const INTENT: PrIntentRecord = {
  summary: "Adds rate limiting to the public API.",
  in_scope: ["Add token-bucket limiter middleware", "Wire limiter into the API router"],
  out_of_scope: ["Per-user quotas", "Admin dashboard for limits"],
  computed_at: new Date().toISOString(),
  provider: "openai",
  model: "gpt-4.1",
  tokens_in: 1200,
  tokens_out: 300,
  cost_usd: 0.01,
};

function renderCard(prId: string | null = "pr-1") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard prId={prId} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders a loading placeholder while the query is pending", () => {
    intentState = { data: undefined, isLoading: true };
    computeState = { isPending: false };
    renderCard();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the empty prompt and derives intent on click", () => {
    intentState = { data: null, isLoading: false };
    computeState = { isPending: false };
    renderCard();

    expect(screen.getByText(/No intent has been derived/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));
    expect(computeMutate).toHaveBeenCalledTimes(1);
  });

  it("renders the derived intent and recomputes on click", () => {
    intentState = { data: INTENT, isLoading: false };
    computeState = { isPending: false };
    renderCard();

    expect(screen.getByText(INTENT.summary)).toBeInTheDocument();
    expect(screen.getByText("Add token-bucket limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Wire limiter into the API router")).toBeInTheDocument();
    expect(screen.getByText("Per-user quotas")).toBeInTheDocument();
    expect(screen.getByText("Admin dashboard for limits")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(computeMutate).toHaveBeenCalledTimes(1);
  });
});
