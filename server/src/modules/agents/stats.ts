import type { AgentRunSummary, AgentStats, FindingCategory, RunTrace } from '@devdigest/shared';
import type { AgentFindingRow } from '../reviews/repository/stats.repo.js';

/**
 * Pure Stats-tab aggregation — takes raw rows (already fetched from the DB),
 * returns the `AgentStats` payload. No I/O, hermetically testable.
 *
 * Windowing: KPI tiles (runs/cost/duration/accept-rate/category-cost) use a
 * trailing 30-day window, with a preceding 30-day window (days 31-60) for a
 * real period-over-period cost delta. The severity chart uses 6 TRAILING
 * 7-DAY buckets ending "now" (not calendar ISO weeks — simpler, no
 * week-numbering edge cases, still reads as "w1..w6" oldest→newest). Skills
 * usage uses the same 30-day window as the KPI tiles for consistency.
 * "Run history" is deliberately NOT window-limited (last 50 runs regardless
 * of age) — a history table gated to 30 days would go empty for lightly-used
 * agents.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_BUCKETS = 6;
const TOP_SKILLS = 5;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export interface AgentStatsInputs {
  agentId: string;
  agentName: string;
  /** Runs from the last 60 days (for the current/prior 30d cost comparison). */
  runs60d: AgentRunSummary[];
  /** Findings (joined w/ their run) from the last 6 weeks. */
  findings6w: AgentFindingRow[];
  /** Run traces from the last 30 days (for skills_used tallying). */
  traces30d: RunTrace[];
  /** Skill id → name, for every id that appears in traces30d's skills_used. */
  skillNames: Map<string, string>;
  /** Last 50 runs regardless of age, for the run-history table. */
  runHistory: AgentRunSummary[];
  now: Date;
}

export function buildAgentStats(inputs: AgentStatsInputs): AgentStats {
  const { runs60d, findings6w, traces30d, skillNames, runHistory, now } = inputs;
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const runsWithDate = runs60d
    .map((r) => ({ r, at: r.ran_at ? new Date(r.ran_at) : null }))
    .filter((x): x is { r: AgentRunSummary; at: Date } => x.at !== null);
  const current30 = runsWithDate.filter((x) => x.at >= since30).map((x) => x.r);
  const prior30 = runsWithDate.filter((x) => x.at < since30).map((x) => x.r);

  const avgCostUsd = average(current30.map((r) => r.cost_usd).filter((v): v is number => v != null));
  const avgCostUsdPrior = average(
    prior30.map((r) => r.cost_usd).filter((v): v is number => v != null),
  );
  const avgCostUsdDelta = avgCostUsd != null && avgCostUsdPrior != null ? avgCostUsd - avgCostUsdPrior : null;
  const avgLatencyMs = average(
    current30.map((r) => r.duration_ms).filter((v): v is number => v != null),
  );
  const totalCostUsd30 = sum(current30.map((r) => r.cost_usd).filter((v): v is number => v != null));
  const findingsTotal30 = sum(current30.map((r) => r.findings_count ?? 0));
  const avgFindingsPerRun = current30.length > 0 ? findingsTotal30 / current30.length : null;

  // Daily run-count trend, oldest→newest, one point per day over the 30d window.
  const trend = buildDailyTrend(current30, since30, now);

  // findings within the 30d window (a subset of the 6-week set) drive
  // accept-rate, the flat severity totals, and category-$ apportionment.
  const findings30 = findings6w.filter((f) => f.ranAt && f.ranAt >= since30);

  const accepted = findings30.filter((f) => f.acceptedAt != null).length;
  const dismissed = findings30.filter((f) => f.dismissedAt != null).length;
  const pending = findings30.length - accepted - dismissed;
  const decided = accepted + dismissed;
  const acceptRate = decided > 0 ? accepted / decided : null;
  const dismissRate = decided > 0 ? dismissed / decided : null;

  const severityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings30) {
    if (f.severity in severityCounts) severityCounts[f.severity as keyof typeof severityCounts]++;
  }

  const categoryCost = new Map<string, number>();
  for (const f of findings30) {
    if (f.runCostUsd == null || !f.runFindingsCount) continue;
    const share = f.runCostUsd / f.runFindingsCount;
    categoryCost.set(f.category, (categoryCost.get(f.category) ?? 0) + share);
  }
  const findingsByCategory = [...categoryCost.entries()].map(([category, cost_usd]) => ({
    category: category as FindingCategory,
    cost_usd,
  }));

  const findingsBySeverityWeekly = buildWeeklyBuckets(findings6w, now);

  const skillCounts = new Map<string, number>();
  for (const trace of traces30d) {
    for (const id of trace.skills_used ?? []) skillCounts.set(id, (skillCounts.get(id) ?? 0) + 1);
  }
  const totalTraces30d = traces30d.length || 1;
  const mostUsedSkills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SKILLS)
    .map(([id, count]) => ({
      skill_id: id,
      name: skillNames.get(id) ?? id,
      pct: (count / totalTraces30d) * 100,
    }));

  return {
    agent_id: inputs.agentId,
    agent_name: inputs.agentName,
    runs: current30.length,
    findings_total: findings30.length,
    accepted,
    dismissed,
    pending,
    accept_rate: acceptRate,
    dismiss_rate: dismissRate,
    avg_findings_per_run: avgFindingsPerRun,
    total_cost_usd: totalCostUsd30,
    avg_cost_usd: avgCostUsd,
    avg_latency_ms: avgLatencyMs,
    findings_by_severity: severityCounts,
    trend,
    avg_cost_usd_delta: avgCostUsdDelta,
    most_used_skills: mostUsedSkills,
    findings_by_severity_weekly: findingsBySeverityWeekly,
    findings_by_category: findingsByCategory,
    run_history: runHistory,
  };
}

/** One point per day over [since, now], run count that day, oldest→newest. */
function buildDailyTrend(
  runs: AgentRunSummary[],
  since: Date,
  now: Date,
): { label: string; value: number }[] {
  const days = Math.max(1, Math.round((now.getTime() - since.getTime()) / DAY_MS));
  const counts = new Array<number>(days).fill(0);
  for (const r of runs) {
    if (!r.ran_at) continue;
    const at = new Date(r.ran_at).getTime();
    const idx = Math.floor((at - since.getTime()) / DAY_MS);
    if (idx >= 0 && idx < days) counts[idx]!++;
  }
  return counts.map((value, i) => ({
    label: new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    value,
  }));
}

/** 6 trailing 7-day buckets ending "now", oldest→newest, zero-filled. */
function buildWeeklyBuckets(
  findings: AgentFindingRow[],
  now: Date,
): { label: string; critical: number; warning: number; suggestion: number }[] {
  const buckets = Array.from({ length: WEEK_BUCKETS }, (_, i) => ({
    label: `w${i + 1}`,
    critical: 0,
    warning: 0,
    suggestion: 0,
  }));
  const windowStart = now.getTime() - WEEK_BUCKETS * 7 * DAY_MS;
  for (const f of findings) {
    if (!f.ranAt) continue;
    const at = f.ranAt.getTime();
    if (at < windowStart || at > now.getTime()) continue;
    const idx = Math.min(WEEK_BUCKETS - 1, Math.floor((at - windowStart) / (7 * DAY_MS)));
    const bucket = buckets[idx]!;
    if (f.severity === 'CRITICAL') bucket.critical++;
    else if (f.severity === 'WARNING') bucket.warning++;
    else if (f.severity === 'SUGGESTION') bucket.suggestion++;
  }
  return buckets;
}
