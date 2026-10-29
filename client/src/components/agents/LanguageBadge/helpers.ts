import type { AgentLanguages } from "@devdigest/shared";

export const MAX_VISIBLE_LANGUAGES = 3;
const SEPARATOR = " · ";

export interface LanguageBadgeText {
  /** Visible text: "Any language", "A · B", or "A · B · C +2". */
  text: string;
  /** Full list (or the any-label) for aria-label and title. */
  full: string;
}

export function formatLanguages(languages: AgentLanguages, anyLabel: string): LanguageBadgeText {
  if (languages === "any" || languages.length === 0) return { text: anyLabel, full: anyLabel };
  const visible = languages.slice(0, MAX_VISIBLE_LANGUAGES).join(SEPARATOR);
  const extra = languages.length - MAX_VISIBLE_LANGUAGES;
  return {
    text: extra > 0 ? `${visible} +${extra}` : visible,
    full: languages.join(SEPARATOR),
  };
}
