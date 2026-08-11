import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 760, padding: "20px 28px" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  box: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "20px 24px",
    minHeight: 220,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
