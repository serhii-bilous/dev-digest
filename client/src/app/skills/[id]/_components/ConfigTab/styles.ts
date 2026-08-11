import type { CSSProperties } from "react";

/** Co-located styles for the Skill Editor's Config tab. */
export const s = {
  wrap: { maxWidth: 760, padding: "20px 28px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20, gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    lineHeight: 1.5,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--warn-bg, #2e1f05)",
    color: "var(--warn, #f59e0b)",
    border: "1px solid var(--warn, #f59e0b)",
    marginBottom: 16,
  } satisfies CSSProperties,
  bodyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  filename: { fontSize: 13, fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" } satisfies CSSProperties,
  unsavedBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--warn, #f59e0b)",
    background: "var(--warn-bg, #2e1f05)",
    padding: "1px 8px",
    borderRadius: 4,
  } satisfies CSSProperties,
  tokenCount: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
