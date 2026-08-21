import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { Line } from "../helpers";
import messages from "../../../../messages/en/shell.json";

import { CodeLine } from "./CodeLine";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function line(o: Partial<Line> = {}): Line {
  return { kind: "add", text: "line two", newNo: 2, ...o };
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

function renderCodeLine(props: Partial<React.ComponentProps<typeof CodeLine>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <CodeLine ln={line()} path="src/foo.ts" threads={[]} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("CodeLine — per-line finding badges", () => {
  it("renders no badge when there are no line findings", () => {
    renderCodeLine({ lineFindings: [] });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders one clickable badge per finding on this line", () => {
    const f1 = finding({ id: "f1", severity: "WARNING" });
    const f2 = finding({ id: "f2", severity: "CRITICAL" });
    renderCodeLine({ lineFindings: [f1, f2] });
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("clicking a badge fires onFindingClick with that exact finding, not just its severity", () => {
    const onFindingClick = vi.fn();
    const f1 = finding({ id: "f1", severity: "WARNING" });
    const f2 = finding({ id: "f2", severity: "CRITICAL" });
    renderCodeLine({ lineFindings: [f1, f2], onFindingClick });

    fireEvent.click(screen.getAllByRole("button")[1]!);

    expect(onFindingClick).toHaveBeenCalledTimes(1);
    expect(onFindingClick).toHaveBeenCalledWith(f2);
  });
});
