import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import messages from "../../../../messages/en/shell.json";

import { SmartDiffViewer } from "./SmartDiffViewer";

// jsdom doesn't implement scrollIntoView — the badge-click effect calls it.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PATCH = `@@ -1,1 +1,2 @@
 unchanged
+added line`;

function file(path: string, o: Partial<PrFile> = {}): PrFile {
  return { path, additions: 1, deletions: 0, patch: PATCH, ...o };
}

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: "Some finding",
    file: "src/middleware/ratelimit.ts",
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

// Response order intentionally shuffled (boilerplate first) — the viewer must
// still render core -> wiring -> boilerplate regardless.
const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "boilerplate",
      files: [{ path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 40, deletions: 2, finding_lines: [] }],
    },
    {
      role: "wiring",
      files: [{ path: "src/config.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }],
    },
    {
      role: "core",
      files: [
        {
          path: "src/middleware/ratelimit.ts",
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          finding_lines: [2],
        },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 2, proposed_splits: [] },
};

const FILES: PrFile[] = [
  file("pnpm-lock.yaml", { additions: 40, deletions: 2 }),
  file("src/config.ts"),
  file("src/middleware/ratelimit.ts"),
];

function renderViewer(findings: FindingRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <SmartDiffViewer smartDiff={SMART_DIFF} files={FILES} findings={findings} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer — group order", () => {
  it("renders groups core -> wiring -> boilerplate regardless of response order", () => {
    renderViewer();
    const labels = screen.getAllByText(/Core logic|Wiring|Boilerplate/).map((el) => el.textContent);
    expect(labels).toEqual(["Core logic", "Wiring", "Boilerplate"]);
  });

  it("boilerplate file starts collapsed while core/wiring files start expanded", () => {
    renderViewer();
    // Core + wiring files are small enough to auto-expand; their added line is visible.
    expect(screen.getAllByText("added line")).toHaveLength(2);
  });
});

describe("SmartDiffViewer — findings badge scroll", () => {
  it("clicking a file's findings badge opens it (if closed) and scrolls to the finding line", () => {
    renderViewer([finding()]);
    const badge = screen.getByRole("button", { name: /click to jump to it/i });
    fireEvent.click(badge);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
