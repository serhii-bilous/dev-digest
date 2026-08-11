"use client";

import { useTranslations } from "next-intl";
import { Chip, SEV } from "@devdigest/ui";
import type { Severity, SeverityCounts } from "@devdigest/shared";

const ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/**
 * One Chip per severity, showing that run's own counts. Selection is a
 * page-level `?severity=` set (owned by the caller, not per-run) — a chip
 * lit here filters every run's panel on the page, not just this one.
 */
export function SeverityFilterBar({
  counts,
  selected,
  onChange,
}: {
  counts: SeverityCounts;
  selected: Severity[];
  onChange: (next: Severity[]) => void;
}) {
  const t = useTranslations("prReview.panel");
  const toggle = (sev: Severity) => {
    onChange(selected.includes(sev) ? selected.filter((s) => s !== sev) : [...selected, sev]);
  };
  return (
    <div role="group" aria-label={t("severityFilter")} style={{ display: "flex", gap: 8 }}>
      {ORDER.map((sev) => (
        <Chip
          key={sev}
          icon={SEV[sev].icon}
          color={SEV[sev].c}
          count={counts[sev]}
          active={selected.includes(sev)}
          onClick={() => toggle(sev)}
        >
          {t(`severity.${sev}`)}
        </Chip>
      ))}
    </div>
  );
}
