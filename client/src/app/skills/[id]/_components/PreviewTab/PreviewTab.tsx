/* PreviewTab — the skill body rendered as the reviewing agent receives it.
   Extracted from SkillDetail's old inline edit/preview toggle, now its own
   tab (no edit state). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.title}>{t("tabs.preview")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <div style={s.box}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
