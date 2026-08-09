import type { SkillType } from "@devdigest/shared";

/** Skill type → chip colour (falls back to --text-secondary for unknown). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#8b5cf6",
};

/** Sources that came from outside the user's direct control and haven't been
 *  reviewed yet — shown with a "needs vetting" indicator. A file the user
 *  picked and reviewed themselves (`manual`/`extracted`) does not need this. */
export const VETTING_REQUIRED_SOURCES = new Set(["imported_url", "community"]);
