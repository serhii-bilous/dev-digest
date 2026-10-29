import type { CSSProperties } from "react";

/** Co-located styles for LocalProviderRow. */
export const s = {
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", marginBottom: 8 } satisfies CSSProperties,
  row: { display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  input: { flex: 1 } satisfies CSSProperties,
  status: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 10 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  testRow: { marginTop: 12 } satisfies CSSProperties,
  result: (ok: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
    fontSize: 13,
    color: ok ? "var(--ok)" : "var(--crit)",
    fontWeight: 600,
  }),
  wrap: { marginBottom: 20 } satisfies CSSProperties,
} as const;
