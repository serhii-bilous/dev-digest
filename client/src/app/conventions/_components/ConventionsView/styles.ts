import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView (mirrors SkillsListView's page shell). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 900, margin: "0 auto" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 20,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
  prPicker: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 } satisfies CSSProperties,
  prPickerLabel: { fontSize: 13, color: "var(--text-secondary)", flexShrink: 0 } satisfies CSSProperties,
  // Hard cap so a long PR title in the option list can't blow out the
  // header layout — SelectInput's own <select> truncates with an ellipsis
  // once it's actually constrained to this width.
  prPickerSelect: { maxWidth: 240, overflow: "hidden" } satisfies CSSProperties,
  errorNote: { fontSize: 13, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  noCandidates: {
    padding: "24px 0",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
