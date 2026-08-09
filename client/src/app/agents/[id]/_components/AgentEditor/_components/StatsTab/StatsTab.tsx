/* StatsTab — KPI tiles, most-used-skills + findings-by-category, findings-by-
   severity (weekly stacked bars), and a run-history table that opens the
   existing RunTraceDrawer (no second trace viewer). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard, CircularScore, BarRow, Donut, StackedBarChart, Skeleton } from "@devdigest/ui";
import { formatCost, formatTokenCount } from "@/lib/format";
import { RunTraceDrawer } from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { useAgentStats } from "../../../../../../../lib/hooks/stats";
import { CATEGORY_COLOR, SEVERITY_KEYS } from "./constants";
import { s } from "./styles";

export function StatsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: stats, isLoading } = useAgentStats(agentId);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <Skeleton height={100} />
        <Skeleton height={200} />
      </div>
    );
  }

  const trend = stats.trend.map((p) => p.value);
  const avgDurationS = stats.avg_latency_ms != null ? stats.avg_latency_ms / 1000 : null;
  const acceptPct = stats.accept_rate != null ? Math.round(stats.accept_rate * 100) : 0;

  const weeks = stats.findings_by_severity_weekly.map((w) => ({
    label: w.label,
    values: { critical: w.critical, warning: w.warning, suggestion: w.suggestion },
  }));
  const severitySeries = SEVERITY_KEYS.map((sv) => ({
    ...sv,
    label: t(`stats.severity.${sv.key}`),
  }));

  const categorySegments = stats.findings_by_category.map((c) => ({
    label: t(`stats.category.${c.category}`),
    value: c.cost_usd,
    color: CATEGORY_COLOR[c.category] ?? "var(--text-secondary)",
  }));

  const traceRun = traceRunId ? stats.run_history.find((r) => r.run_id === traceRunId) : null;

  return (
    <div style={s.wrap}>
      <div style={s.kpiRow}>
        <MetricCard label={t("stats.totalRuns")} value={stats.runs} trend={trend} />
        <MetricCard
          label={t("stats.avgCost")}
          value={formatCost(stats.avg_cost_usd)}
          delta={stats.avg_cost_usd_delta ?? undefined}
        />
        <MetricCard
          label={t("stats.avgDuration")}
          value={avgDurationS != null ? avgDurationS.toFixed(1) : "—"}
          suffix="s"
        />
        <div style={s.gaugeTile}>
          <span style={s.gaugeLabel}>{t("stats.acceptRate")}</span>
          <div style={s.gaugeBody}>
            <CircularScore score={acceptPct} size={56} stroke={5} />
          </div>
        </div>
      </div>

      <div style={s.panelRow}>
        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.mostUsedSkills")}</div>
          {stats.most_used_skills.length === 0 ? (
            <div style={s.panelEmpty}>{t("stats.noSkillsUsed")}</div>
          ) : (
            stats.most_used_skills.map((sk) => (
              <BarRow
                key={sk.skill_id}
                label={sk.name}
                value={sk.pct}
                max={100}
                suffix={`${Math.round(sk.pct)}%`}
              />
            ))
          )}
        </div>
        <div style={s.panel}>
          <div style={s.panelTitle}>{t("stats.findingsByCategory")}</div>
          {categorySegments.length === 0 ? (
            <div style={s.panelEmpty}>{t("stats.noRuns")}</div>
          ) : (
            <Donut segments={categorySegments} />
          )}
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.panelTitle}>{t("stats.findingsBySeverity")}</div>
        <StackedBarChart weeks={weeks} series={severitySeries} />
      </div>

      <div style={s.panel}>
        <div style={s.panelTitle}>{t("stats.runHistory")}</div>
        {stats.run_history.length === 0 ? (
          <div style={s.panelEmpty}>{t("stats.noRuns")}</div>
        ) : (
          <div>
            <div style={{ ...s.historyRow, ...s.historyHeader }}>
              <span>{t("stats.columns.timestamp")}</span>
              <span>{t("stats.columns.pr")}</span>
              <span>{t("stats.columns.tokens")}</span>
              <span>{t("stats.columns.cost")}</span>
              <span>{t("stats.columns.findings")}</span>
              <span>{t("stats.columns.source")}</span>
              <span />
            </div>
            {stats.run_history.map((r) => (
              <div key={r.run_id} style={s.historyRow}>
                <span style={s.mono}>{r.ran_at ? new Date(r.ran_at).toLocaleDateString() : "—"}</span>
                <span className="mono">{r.pr_number != null ? `#${r.pr_number}` : "—"}</span>
                <span className="mono">{formatTokenCount((r.tokens_in ?? 0) + (r.tokens_out ?? 0))}</span>
                <span className="mono">{formatCost(r.cost_usd)}</span>
                <span className="mono">{r.findings_count ?? "—"}</span>
                <span>{r.source ?? "—"}</span>
                <button
                  onClick={() => setTraceRunId(r.run_id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                    fontSize: 13,
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  {t("stats.viewTrace")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          agentName={traceRun?.agent_name}
          prNumber={traceRun?.pr_number}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </div>
  );
}
