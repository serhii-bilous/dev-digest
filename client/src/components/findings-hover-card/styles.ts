import type { CSSProperties } from "react";

/** Co-located styles for FindingsHoverCard + SeverityBadges. */
export const s = {
  badges: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  anchor: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  card: {
    position: "fixed",
    zIndex: 50,
    width: 360,
    maxHeight: 320,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 10,
  } satisfies CSSProperties,
  heading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 2px",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBottom: 10,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  rowTitle: {
    fontSize: 13,
    fontWeight: 550,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  rowMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  rationale: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
