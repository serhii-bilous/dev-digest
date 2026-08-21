import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import messages from "../../../../messages/en/shell.json";

import { FileCard } from "./FileCard";

// jsdom doesn't implement scrollIntoView — the badge-click effect calls it.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SMALL_PATCH = `@@ -1,2 +1,3 @@
 line one
+line two
 line three`;

function file(o: Partial<PrFile> = {}): PrFile {
  return {
    path: "src/foo.ts",
    additions: 1,
    deletions: 0,
    patch: SMALL_PATCH,
    ...o,
  };
}

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: "Some finding",
    file: "src/foo.ts",
    start_line: 2,
    end_line: 2,
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

function renderFileCard(props: Partial<React.ComponentProps<typeof FileCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <FileCard file={file()} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard — role-driven open state", () => {
  it("starts expanded for a small core file (default size-based behavior, unchanged)", () => {
    renderFileCard({ role: "core" });
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it("starts collapsed for a boilerplate file even though it's small enough to auto-expand", () => {
    renderFileCard({ role: "boilerplate" });
    expect(screen.queryByText("line two")).not.toBeInTheDocument();
  });

  it("a boilerplate file can still be opened manually by clicking its header", () => {
    renderFileCard({ role: "boilerplate" });
    fireEvent.click(screen.getByText("src/foo.ts"));
    expect(screen.getByText("line two")).toBeInTheDocument();
  });
});

describe("FileCard — findings badge", () => {
  it("renders no badge when there are no findings", () => {
    renderFileCard({ role: "core", findings: [] });
    expect(screen.queryByRole("button", { name: /finding/i })).not.toBeInTheDocument();
  });

  it("renders a findings badge with the right severity count", () => {
    renderFileCard({
      role: "core",
      findings: [finding({ id: "f1", severity: "WARNING" }), finding({ id: "f2", severity: "WARNING" })],
    });
    const badge = screen.getByRole("button", { name: /click to jump to it/i });
    expect(within(badge).getByText("2")).toBeInTheDocument();
  });

  it("clicking the badge opens the file (if closed) and scrolls to the lowest finding line", () => {
    renderFileCard({
      role: "boilerplate", // starts closed
      findings: [finding({ id: "f1", start_line: 5 }), finding({ id: "f2", start_line: 2 })],
    });
    expect(screen.queryByText("line two")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /click to jump to it/i }));

    expect(screen.getByText("line two")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("clicking the badge does not toggle the card closed (stops propagation)", () => {
    renderFileCard({ role: "core", findings: [finding({ id: "f1" })] });
    expect(screen.getByText("line two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /click to jump to it/i }));

    expect(screen.getByText("line two")).toBeInTheDocument();
  });
});

describe("FileCard — per-line finding badges", () => {
  it("renders a clickable badge on the matching line for each finding, keyed by id", () => {
    const onFindingClick = vi.fn();
    const f1 = finding({ id: "f1", severity: "WARNING", start_line: 2, end_line: 2 });
    const f2 = finding({ id: "f2", severity: "CRITICAL", start_line: 2, end_line: 2 });
    renderFileCard({ role: "core", findings: [f1, f2], onFindingClick });

    // Two per-line buttons on "line two", none on the other lines.
    const lineTwo = screen.getByText("line two").closest<HTMLElement>("div[style*='display: flex']")!;
    const lineButtons = within(lineTwo).getAllByRole("button");
    expect(lineButtons).toHaveLength(2);

    fireEvent.click(lineButtons[0]!);
    expect(onFindingClick).toHaveBeenCalledWith(f1);
  });

  it("does not render a per-line badge when no finding targets that line", () => {
    renderFileCard({
      role: "core",
      findings: [finding({ id: "f1", start_line: 99, end_line: 99 })],
    });
    const lineTwo = screen.getByText("line two").closest<HTMLElement>("div[style*='display: flex']")!;
    expect(within(lineTwo).queryByRole("button")).not.toBeInTheDocument();
  });
});
