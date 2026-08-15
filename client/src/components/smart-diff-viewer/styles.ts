import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  toggleRow: { display: "flex", justifyContent: "flex-end", marginBottom: 4 } satisfies CSSProperties,
  segmented: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
  } satisfies CSSProperties,
  segmentBtn: (active: boolean): CSSProperties => ({
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
  }),
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  groupHeader: { display: "flex", alignItems: "baseline", gap: 10, padding: "2px 2px" } satisfies CSSProperties,
  groupDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
    flexShrink: 0,
  }),
  groupLabel: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  groupDescription: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  groupCount: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groupFiles: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;

export const ROLE_DOT_COLOR: Record<string, string> = {
  core: "var(--crit)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};
