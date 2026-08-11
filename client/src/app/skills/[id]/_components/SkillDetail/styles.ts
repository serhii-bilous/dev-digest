import type { CSSProperties } from "react";

/** Co-located styles for the SkillDetail tab shell (mirrors AgentEditor's). */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto" } satisfies CSSProperties,
} as const;
