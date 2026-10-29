"use client";

import { useTranslations } from "next-intl";
import type { AgentLanguages } from "@devdigest/shared";
import { formatLanguages } from "./helpers";
import { s } from "./styles";

interface LanguageBadgeProps {
  languages: AgentLanguages;
}

/** Agent language declaration as plain text; the full list is the accessible name and tooltip. */
export function LanguageBadge({ languages }: LanguageBadgeProps) {
  const t = useTranslations("agents");
  const { text, full } = formatLanguages(languages, t("languageBadge.any"));
  return (
    <span role="img" aria-label={full} title={full} style={s.badge}>
      {text}
    </span>
  );
}

export default LanguageBadge;
