import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. L02 adds Skills/Evals/Stats; later lessons add CI. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "Gauge" },
];
