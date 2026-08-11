"use client";

import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { SeverityCounts } from "@devdigest/shared";
import { s } from "./styles";

const ORDER: (keyof SeverityCounts)[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Non-zero severities as compact badges, worst-first; "None" when all-zero. */
export function SeverityBadges({
  counts,
  compact = true,
}: {
  counts: SeverityCounts;
  compact?: boolean;
}) {
  const t = useTranslations("prReview.findings");
  const total = counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
  if (total === 0) return <span style={{ color: "var(--text-muted)" }}>{t("none")}</span>;
  return (
    <span style={s.badges}>
      {ORDER.filter((sev) => counts[sev] > 0).map((sev) => (
        <SeverityBadge key={sev} severity={sev} count={counts[sev]} compact={compact} />
      ))}
    </span>
  );
}
