"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RepoStack } from "@devdigest/shared";
import { formatLanguageShare, topLanguages } from "./helpers";
import { s } from "./styles";

interface StackHeaderProps {
  repoName: string;
  stack: RepoStack | undefined;
}

/** Repo full name, its top code languages and when the stack was fetched. Focusable so Retry can hand focus here. */
export const StackHeader = React.forwardRef<HTMLDivElement, StackHeaderProps>(function StackHeader(
  { repoName, stack },
  ref,
) {
  const t = useTranslations("agents");
  const { shown, more } = topLanguages(stack?.languages ?? []);
  return (
    <div ref={ref} tabIndex={-1} style={s.root} aria-label={repoName}>
      <span style={s.repo}>{repoName}</span>
      {stack && (
        <span style={s.langs}>
          <span style={s.label}>{t("stack.title")}</span>
          {shown.length === 0 ? (
            <span>{t("stack.none")}</span>
          ) : (
            <span>{shown.map(formatLanguageShare).join(" · ")}</span>
          )}
          {more > 0 && <span style={s.label}>{t("stack.moreCount", { count: more })}</span>}
        </span>
      )}
      {stack?.fetched_at && (
        <span style={s.label}>{t("stack.fetchedAt", { time: new Date(stack.fetched_at).toLocaleString() })}</span>
      )}
    </div>
  );
});
