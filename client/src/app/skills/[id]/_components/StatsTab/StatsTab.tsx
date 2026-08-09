/* StatsTab (skill) — "Used by N agents / pull frequency / accept rate /
   findings (30d)" tiles + agents-using-this-skill list + findings-by-category
   donut. Distinct from the agent Stats tab: no run-history table, no
   severity-weekly chart, no most-used-skills panel (this page IS one skill
   showing which agents use IT). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MetricCard, CircularScore, Donut, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR } from "./constants";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: stats, isLoading } = useSkillStats(skill.id);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <Skeleton height={100} />
        <Skeleton height={200} />
      </div>
    );
  }

  const pullPct = stats.pull_rate != null ? Math.round(stats.pull_rate * 100) : 0;
  const acceptPct = stats.accept_rate != null ? Math.round(stats.accept_rate * 100) : 0;
  const categorySegments = stats.findings_by_category.map((c) => ({
    label: t(`stats.category.${c.category}`),
    value: c.cost_usd,
    color: CATEGORY_COLOR[c.category] ?? "var(--text-secondary)",
  }));

  return (
    <div style={s.wrap}>
      <div style={s.kpiRow}>
        <MetricCard label={t("stats.usedBy")} value={stats.agent_count} suffix={` ${t("stats.agentsSuffix")}`} />
        <MetricCard label={t("stats.pullFrequency")} value={pullPct} suffix="%" />
        <div style={s.gaugeTile}>
          <span style={s.gaugeLabel}>{t("stats.acceptRate")}</span>
          <div style={s.gaugeBody}>
            <CircularScore score={acceptPct} size={56} stroke={5} />
          </div>
        </div>
        <MetricCard label={t("stats.findings30d")} value={stats.findings_30d} />
      </div>

      <div style={s.panelRow}>
        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.agentsUsingSkill")}</div>
          {stats.agents.length === 0 ? (
            <div style={s.panelEmpty}>{t("stats.noAgents")}</div>
          ) : (
            stats.agents.map((a) => (
              <div key={a.agent_id} style={s.agentRow}>
                <div style={s.agentIcon}>
                  <Icon.Cpu size={12} />
                </div>
                <span style={s.agentName}>{a.agent_name}</span>
                <button style={s.openLink} onClick={() => router.push(`/agents/${a.agent_id}`)}>
                  {t("stats.openAgent")}
                </button>
              </div>
            ))
          )}
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.findingsByCategory")}</div>
          {categorySegments.length === 0 ? (
            <div style={s.panelEmpty}>{t("stats.noFindings")}</div>
          ) : (
            <Donut segments={categorySegments} />
          )}
        </div>
      </div>
    </div>
  );
}
