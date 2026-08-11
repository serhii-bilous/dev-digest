import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal (mirrors CreateAgentModal). */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: 13,
    marginBottom: 20,
  } satisfies CSSProperties,
  bodyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  } satisfies CSSProperties,
  filename: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tokenCount: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
