import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  expectedRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  expectedList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  removeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  } satisfies CSSProperties,
  addBtn: {
    background: "none",
    border: "1px dashed var(--border-strong)",
    borderRadius: 6,
    padding: "8px 12px",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
