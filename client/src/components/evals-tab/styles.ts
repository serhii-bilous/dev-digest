import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { maxWidth: 760, padding: "20px 28px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  badge: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "2px 10px",
    borderRadius: 5,
  } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, marginTop: 18 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  subtitle: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 4, flexShrink: 0 } satisfies CSSProperties,
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 6,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "24px 0" } satisfies CSSProperties,
} as const;
