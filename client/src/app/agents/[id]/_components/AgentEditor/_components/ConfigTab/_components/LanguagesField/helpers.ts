import type { AgentLanguages } from "@devdigest/shared";
import { MAX_LANGUAGES, MAX_LANGUAGE_LENGTH } from "../../constants";

export interface LanguagesDraft {
  any: boolean;
  list: string[];
}

export type LanguageError = "required" | "tooMany" | "tooLong" | null;

export function toDraft(languages: AgentLanguages): LanguagesDraft {
  return languages === "any" ? { any: true, list: [] } : { any: false, list: [...languages] };
}

export function fromDraft(draft: LanguagesDraft): AgentLanguages {
  return draft.any ? "any" : draft.list;
}

/** Validation for a draft that is about to be saved. */
export function draftError(draft: LanguagesDraft): LanguageError {
  if (draft.any) return null;
  if (draft.list.length === 0) return "required";
  if (draft.list.length > MAX_LANGUAGES) return "tooMany";
  return null;
}

/** Returns the new list, or the reason the name can't be added. Duplicates (case-insensitive) are ignored. */
export function addLanguage(list: string[], raw: string): { list: string[]; error: LanguageError } {
  const name = raw.trim();
  if (!name) return { list, error: null };
  if (name.length > MAX_LANGUAGE_LENGTH) return { list, error: "tooLong" };
  if (list.some((l) => l.toLowerCase() === name.toLowerCase())) return { list, error: null };
  if (list.length >= MAX_LANGUAGES) return { list, error: "tooMany" };
  return { list: [...list, name], error: null };
}
