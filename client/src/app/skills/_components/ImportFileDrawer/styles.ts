import type { CSSProperties } from "react";

/** Co-located styles for ImportFileDrawer. */
export const s = {
  tabsRow: { display: "flex", gap: 8, marginBottom: 18 } satisfies CSSProperties,
  tab: (active: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    cursor: "default",
  }),
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  fileName: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
