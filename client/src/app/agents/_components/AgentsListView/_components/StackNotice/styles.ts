import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    marginBottom: 16,
    borderRadius: 7,
    border: "1px solid var(--warning, #f59e0b)",
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  text: { flex: 1 } satisfies CSSProperties,
  button: (busy: boolean): CSSProperties => ({
    padding: "5px 10px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
  }),
} as const;
