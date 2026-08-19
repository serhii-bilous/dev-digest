/* FindingsPanel — severity counters + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings, countBySeverity } from "./helpers";
import { SeverityFilterBar } from "./SeverityFilterBar";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  selectedSeverities = [],
  onSelectedSeveritiesChange,
  targetFindingId = null,
  targetNonce = 0,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Page-level `?severity=` selection — shared across every run's panel. */
  selectedSeverities?: Severity[];
  onSelectedSeveritiesChange?: (next: Severity[]) => void;
  /** Set when navigation targets a specific finding (Smart Diff badge click)
   *  — focuses that card and forces it open/scrolled-to. Silently a no-op if
   *  the target finding is filtered out of `shown` (hideLow / severity filter). */
  targetFindingId?: string | null;
  targetNonce?: number;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, selectedSeverities),
    [findings, hideLow, selectedSeverities],
  );

  // Smart Diff badge navigation: focus the target finding's card (reuses the
  // same `focused` highlight j/k nav already drives).
  React.useEffect(() => {
    if (!targetFindingId) return;
    const idx = shown.findIndex((f) => f.id === targetFindingId);
    if (idx >= 0) setFocusIdx(idx);
  }, [targetFindingId, targetNonce, shown]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityFilterBar
          counts={countBySeverity(findings)}
          selected={selectedSeverities}
          onChange={(next) => onSelectedSeveritiesChange?.(next)}
        />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              targetFindingId={targetFindingId}
              targetNonce={targetNonce}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
