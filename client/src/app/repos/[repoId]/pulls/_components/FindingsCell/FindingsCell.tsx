"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsHoverCard } from "@/components/findings-hover-card";
import { usePrReviews } from "@/lib/hooks/reviews";
import { s } from "../../styles";

const ORDER: ("CRITICAL" | "WARNING" | "SUGGESTION")[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/**
 * The PR list's FINDINGS cell: `—` when the PR was never reviewed, "None"
 * when it was reviewed and came back clean, else per-severity badges — with
 * a hover card listing every finding of every review, fetched lazily on open.
 */
export function FindingsCell({ pr }: { pr: PrMeta }) {
  const t = useTranslations("prReview");
  const [wantsFetch, setWantsFetch] = React.useState(false);
  const { data: reviews, isLoading } = usePrReviews(pr.id, { enabled: wantsFetch });

  const findings = pr.findings;
  if (!findings) {
    return (
      <div style={s.findingsCell}>
        <span style={s.muted}>—</span>
      </div>
    );
  }

  const total = findings.CRITICAL + findings.WARNING + findings.SUGGESTION;
  if (total === 0) {
    return (
      <div style={s.findingsCell}>
        <span style={s.muted}>{t("findings.none")}</span>
      </div>
    );
  }

  const allFindings: FindingRecord[] = (reviews ?? []).flatMap((r) => r.findings);

  return (
    <div style={s.findingsCell}>
      <FindingsHoverCard
        findings={allFindings}
        loading={wantsFetch && isLoading}
        onOpenChange={setWantsFetch}
      >
        {ORDER.filter((sev) => findings[sev] > 0).map((sev) => (
          <SeverityBadge key={sev} severity={sev} count={findings[sev]} compact />
        ))}
      </FindingsHoverCard>
    </div>
  );
}
