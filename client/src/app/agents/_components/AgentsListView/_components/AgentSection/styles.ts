import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "../../constants";

export const s = {
  section: { marginBottom: 28 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 600, marginBottom: 10 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--danger, #dc2626)", marginTop: -4 } satisfies CSSProperties,
  button: (busy: boolean): CSSProperties => ({
    padding: "4px 10px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
    whiteSpace: "nowrap",
  }),
} as const;
