import type { CiFailOn, ReviewStrategy } from "@devdigest/shared";

/** Model to fall back to when an agent leaves the Local provider. */
export const DEFAULT_MODEL = "gpt-4.1";

/** Selectable review strategies (labels are i18n'd in the component). */
export const STRATEGY_VALUES: readonly ReviewStrategy[] = ["single-pass", "map-reduce", "auto"];

/** CI gate policy options — when a CI review blocks/fails (labels i18n'd). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

/** Output-schema options (only one supported in MVP). */
export const OUTPUT_SCHEMA_VALUE = "Standard findings JSON";

/** Suggested languages for the Languages field (custom names are also allowed). */
export const LANGUAGE_SUGGESTIONS: readonly string[] = [
  "Python", "TypeScript", "JavaScript", "Go", "Java", "Ruby", "Rust", "C#", "PHP", "Kotlin", "Swift", "C", "C++",
];

/** Limits mirroring the AgentLanguages contract in @devdigest/shared. */
export const MAX_LANGUAGES = 20;
export const MAX_LANGUAGE_LENGTH = 50;
