import type { CSSProperties } from "react";

export const s = {
  radios: { display: "flex", gap: 20, marginBottom: 10, fontSize: 13 } satisfies CSSProperties,
  radio: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 } satisfies CSSProperties,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    fontSize: 12,
    border: "1px solid var(--border)",
    borderRadius: 999,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  chipBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "var(--text-secondary)",
    padding: 0,
    fontSize: 12,
  } satisfies CSSProperties,
  suggestion: {
    padding: "2px 8px",
    fontSize: 12,
    border: "1px dashed var(--border)",
    borderRadius: 999,
    background: "transparent",
    cursor: "pointer",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  addRow: { display: "flex", gap: 8, marginTop: 8 } satisfies CSSProperties,
  error: { marginTop: 6, fontSize: 13, color: "var(--danger, #b91c1c)" } satisfies CSSProperties,
} as const;
