import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 900, padding: "20px 28px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 } satisfies CSSProperties,
  gaugeTile: {
    flex: 1,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  gaugeLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } satisfies CSSProperties,
  gaugeBody: { display: "flex", alignItems: "center", marginTop: 12 } satisfies CSSProperties,
  panelRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } satisfies CSSProperties,
  panel: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
  } satisfies CSSProperties,
  panelTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  panelEmpty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  historyRow: {
    display: "grid",
    gridTemplateColumns: "140px 80px 90px 80px 80px 70px 80px",
    alignItems: "center",
    gap: 10,
    padding: "8px 4px",
    fontSize: 13,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  historyHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
} as const;
