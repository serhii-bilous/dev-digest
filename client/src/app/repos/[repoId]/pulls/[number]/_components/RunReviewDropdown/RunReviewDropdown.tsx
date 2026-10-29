/* RunReviewDropdown — ported from components2.jsx.
   "Run all active agents" / a specific agent → kicks off POST /pulls/:id/review
   and hands the resulting runIds up so the parent can stream SSE live status. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useRepoAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { DROPDOWN_WIDTH } from "./constants";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  // Only agents compatible with this PR's repo come back (AC-33).
  const { data: agents, isLoading } = useRepoAgents(repoId);
  const run = useRunReview();
  const all = agents ?? [];
  const hasActive = all.some((a) => a.active);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } catch {
      // The global MutationCache toast already shows the API message (e.g. 409).
    } finally {
      onRunSettled?.();
    }
  };

  // List every compatible agent; inactive ones carry a text hint (not colour
  // only, NFR-9) and can still be run individually (AC-34). "Run all" targets
  // active agents only.
  const agentItems: DropdownItemDef[] = all.length
    ? all.map((a) => ({
        label: a.name,
        icon: "Cpu" as const,
        hint: a.active ? a.model : t("runReview.inactiveHint", { model: a.model }),
        onClick: () => kick({ agentId: a.id }),
      }))
    : [
        isLoading
          ? { label: t("runReview.loadingAgents"), icon: "Cpu" as const, muted: true }
          : {
              label: t("runReview.noCompatible"),
              icon: "AlertTriangle" as const,
              muted: true,
              hint: t("runReview.noCompatibleHint"),
              onClick: () => router.push("/agents"),
            },
      ];

  const items: DropdownItemDef[] = [
    // Merged/closed PRs can still be reviewed (informational only); lead with a
    // muted, non-actionable warning so the intent is clear.
    ...(warnMerged
      ? [
          { label: t("runReview.mergedWarning"), icon: "AlertTriangle" as const, muted: true },
          { divider: true } as DropdownItemDef,
        ]
      : []),
    {
      label: t("runReview.runAll"),
      icon: "Play",
      ...(hasActive
        ? { onClick: () => kick({ all: true }) }
        : { muted: true, hint: t("runReview.noActiveTooltip") }),
    },
    { divider: true },
    ...agentItems,
    { divider: true },
    { label: t("runReview.configureAgents"), icon: "Settings", muted: true, onClick: () => router.push("/agents") },
  ];

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      items={items}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
