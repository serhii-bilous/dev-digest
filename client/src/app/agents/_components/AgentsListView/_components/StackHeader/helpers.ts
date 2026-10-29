import type { RepoStack } from "@devdigest/shared";

export const MAX_HEADER_LANGUAGES = 5;

type Language = RepoStack["languages"][number];

export function topLanguages(languages: Language[]): { shown: Language[]; more: number } {
  const sorted = [...languages].sort((a, b) => b.percent - a.percent);
  return { shown: sorted.slice(0, MAX_HEADER_LANGUAGES), more: Math.max(0, sorted.length - MAX_HEADER_LANGUAGES) };
}

export function formatLanguageShare(l: Language): string {
  return `${l.name} ${Math.round(l.percent)}%`;
}
