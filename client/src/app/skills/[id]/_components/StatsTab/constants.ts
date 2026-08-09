import type { FindingCategory } from "@devdigest/shared";

/** Chart fill colors — literal hex, not CSS custom properties (SVG fill
 *  attribute support for var() is inconsistent). Matches the agent Stats
 *  tab's category palette for visual consistency across the app. */
export const CATEGORY_COLOR: Record<FindingCategory, string> = {
  security: "#ef4444",
  bug: "#f59e0b",
  perf: "#8b5cf6",
  style: "#3b82f6",
  test: "#10b981",
};
