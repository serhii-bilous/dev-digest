import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { sortBySeverity, popoverPosition, type Rect } from "./helpers";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f-1",
    review_id: "r-1",
    severity: "WARNING",
    category: "bug",
    title: "t",
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

function rect(o: Partial<Rect>): Rect {
  return { top: 100, left: 100, right: 150, bottom: 120, width: 50, height: 20, ...o };
}

describe("sortBySeverity", () => {
  it("orders CRITICAL, then WARNING, then SUGGESTION", () => {
    const sorted = sortBySeverity([
      finding({ id: "s", severity: "SUGGESTION" }),
      finding({ id: "c", severity: "CRITICAL" }),
      finding({ id: "w", severity: "WARNING" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["c", "w", "s"]);
  });

  it("does not mutate the input array", () => {
    const input = [finding({ id: "s", severity: "SUGGESTION" }), finding({ id: "c", severity: "CRITICAL" })];
    const copy = [...input];
    sortBySeverity(input);
    expect(input).toEqual(copy);
  });
});

describe("popoverPosition", () => {
  const viewport = { width: 1200, height: 800 };
  const card = { width: 360, height: 240 };

  it("opens below, left-aligned, when there is room", () => {
    const pos = popoverPosition(rect({ top: 100, left: 100, bottom: 120 }), viewport, card);
    expect(pos.left).toBe(100);
    expect(pos.top).toBe(128); // bottom (120) + GAP (8)
  });

  it("flips above when there's no room below but room above", () => {
    const anchor = rect({ top: 700, left: 100, bottom: 720 });
    const pos = popoverPosition(anchor, viewport, card);
    expect(pos.top).toBe(700 - card.height - 8);
  });

  it("clamps the right edge so the card never crosses the viewport", () => {
    const anchor = rect({ top: 100, left: 1100, bottom: 120 });
    const pos = popoverPosition(anchor, viewport, card);
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width);
  });

  it("clamps both the bottom-right corner (flip + right clamp) together", () => {
    const anchor = rect({ top: 700, left: 1100, bottom: 720 });
    const pos = popoverPosition(anchor, viewport, card);
    expect(pos.top).toBe(700 - card.height - 8);
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width);
  });

  it("clamps the left edge on a narrow viewport instead of going negative", () => {
    const narrow = { width: 300, height: 800 };
    const anchor = rect({ top: 100, left: -50, bottom: 120 });
    const pos = popoverPosition(anchor, narrow, card);
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });
});
