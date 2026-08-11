import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard (modeled on FindingCard's card shape). */
export const s = {
  card: {
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--border)",
    background: "var(--bg-elevated)",
    padding: "14px 16px",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  titleWrap: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  categoryTag: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginTop: 4,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  evidence: {
    marginTop: 12,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  evidencePath: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evidenceSnippet: {
    margin: 0,
    padding: "10px 12px",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  confidenceBar: {
    flex: 1,
    maxWidth: 160,
    height: 5,
    borderRadius: 3,
    background: "var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  confidenceFill: (pct: number, color: string): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: color,
  }),
  confidencePct: {
    fontSize: 12,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
} as const;
