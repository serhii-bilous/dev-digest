import type { CSSProperties } from "react";

export const s = {
  box: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    minHeight: 88,
    display: "flex",
    alignItems: "center",
  } satisfies CSSProperties,
  comingSoon: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
