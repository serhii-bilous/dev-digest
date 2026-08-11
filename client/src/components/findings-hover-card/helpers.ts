import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_ORDER } from "./constants";

/** Worst-first: CRITICAL, then WARNING, then SUGGESTION. */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
}
export interface CardSize {
  width: number;
  height: number;
}

const GAP = 8;

/**
 * `position: fixed` placement for a hover card anchored to `anchor`. Opens
 * below, left-aligned to the anchor, by default; flips above when there's no
 * room below and more room above, and clamps so the card never crosses the
 * viewport's right or left edge.
 */
export function popoverPosition(
  anchor: Rect,
  viewport: Viewport,
  card: CardSize,
): { top: number; left: number } {
  const spaceBelow = viewport.height - anchor.bottom;
  const spaceAbove = anchor.top;
  const flipUp = spaceBelow < card.height + GAP && spaceAbove > spaceBelow;

  const top = flipUp
    ? Math.max(GAP, anchor.top - card.height - GAP)
    : Math.min(anchor.bottom + GAP, viewport.height - card.height - GAP);

  let left = anchor.left;
  if (left + card.width > viewport.width - GAP) {
    left = viewport.width - card.width - GAP;
  }
  left = Math.max(GAP, left);

  return { top, left };
}
