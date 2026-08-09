import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760, padding: "20px 28px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "2px 10px",
    borderRadius: 5,
  } satisfies CSSProperties,
  filterRow: { margin: "14px 0" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (isDragging: boolean, dropPosition: "before" | "after" | null): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: isDragging ? 0.5 : 1,
    boxShadow:
      dropPosition === "before"
        ? "0 -2px 0 0 var(--accent)"
        : dropPosition === "after"
          ? "0 2px 0 0 var(--accent)"
          : "none",
  }),
  dragHandle: {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--text-muted)",
    cursor: "grab",
    flexShrink: 0,
  } satisfies CSSProperties,
  dragHandleSpacer: { display: "inline-block", width: 14, flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 8px",
    borderRadius: 4,
    fontFamily: "var(--font-mono, monospace)",
  }),
  moveBtns: { display: "flex", gap: 2 } satisfies CSSProperties,
  moveBtn: (disabled: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
    opacity: disabled ? 0.4 : 1,
    display: "inline-flex",
    padding: 4,
  }),
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "24px 0" } satisfies CSSProperties,
} as const;
