import type { SkillType } from "@devdigest/shared";

/** Skill type → chip colour. Duplicates SkillCard's map (small, no shared
 *  util layer between the agents and skills feature folders). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#8b5cf6",
};
