import type { CSSProperties } from "react";

/** accent-text on accent-bg is the repo's AA-checked pair (both themes). */
export const s = {
  badge: {
    flexShrink: 0,
    whiteSpace: "nowrap",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
};
