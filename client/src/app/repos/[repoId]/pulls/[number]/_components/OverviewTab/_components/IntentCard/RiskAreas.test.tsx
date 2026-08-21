import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import type { Risk } from "@devdigest/shared";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const RISKS: Risk[] = [
  {
    kind: "auth",
    title: "Auth surface touched",
    explanation: "Middleware sits in front of /api/public/* and reads the Authorization header.",
    severity: "high",
    file_refs: ["src/middleware/ratelimit.ts:12-18"],
  },
  {
    kind: "dependency",
    title: "New dependency: ioredis",
    explanation: "Adds ioredis@5.4.1 for the distributed token bucket.",
    severity: "medium",
    file_refs: ["package.json:34"],
  },
];

function renderRisks(risks: Risk[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RiskAreas risks={risks} />
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas", () => {
  it("shows the empty state when there are no risks", () => {
    renderRisks([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("expands a risk's explanation and source ref on click, and collapses on a second click", () => {
    renderRisks(RISKS);

    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
    expect(screen.queryByText(/Middleware sits in front of/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Auth surface touched"));
    expect(screen.getByText(/Middleware sits in front of/)).toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.ts:12-18")).toBeInTheDocument();

    // Switching to the second chip replaces the open panel, not stacks it.
    fireEvent.click(screen.getByText("New dependency: ioredis"));
    expect(screen.queryByText(/Middleware sits in front of/)).not.toBeInTheDocument();
    expect(screen.getByText(/Adds ioredis@5.4.1/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("New dependency: ioredis"));
    expect(screen.queryByText(/Adds ioredis@5.4.1/)).not.toBeInTheDocument();
  });
});
