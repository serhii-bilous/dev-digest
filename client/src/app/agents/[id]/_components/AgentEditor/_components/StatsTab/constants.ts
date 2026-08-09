import type { FindingCategory } from "@devdigest/shared";

/** Chart fill colors — literal hex, not CSS custom properties (SVG fill
 *  attribute support for var() is inconsistent; the rest of this codebase's
 *  chart components take literal color strings too). */
export const CATEGORY_COLOR: Record<FindingCategory, string> = {
  security: "#ef4444",
  bug: "#f59e0b",
  perf: "#8b5cf6",
  style: "#3b82f6",
  test: "#10b981",
};

/** Stack order + fill color for the severity chart; labels come from the
 *  `stats.severity.*` locale keys at render time. */
export const SEVERITY_KEYS = [
  { key: "critical", color: "#ef4444" },
  { key: "warning", color: "#f59e0b" },
  { key: "suggestion", color: "#3b82f6" },
] as const;
