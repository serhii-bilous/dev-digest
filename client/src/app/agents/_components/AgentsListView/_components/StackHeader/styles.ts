import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "4px 16px",
    marginBottom: 14,
    fontSize: 13,
    outline: "none",
  } satisfies CSSProperties,
  repo: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  langs: { display: "inline-flex", gap: 8, alignItems: "baseline" } satisfies CSSProperties,
  label: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
