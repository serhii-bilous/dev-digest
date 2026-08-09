import { z } from 'zod';
import { Severity, SeverityCounts, FindingCategory } from './findings.js';
import { AgentRunSummary } from './trace.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: SeverityCounts,
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
  /** Period-over-period change in avg_cost_usd vs. the preceding window; null
   *  when there's no prior-period data to compare against. */
  avg_cost_usd_delta: z.number().nullable(),
  /** Top skills by share of this agent's runs in the stats window (skill
   *  linked+enabled at run time — see RunTrace.skills_used), highest first. */
  most_used_skills: z.array(z.object({ skill_id: z.string(), name: z.string(), pct: z.number() })),
  /** Findings by severity, bucketed per week (oldest→newest) for a stacked
   *  bar chart — a per-week breakdown of the flat `findings_by_severity` total. */
  findings_by_severity_weekly: z.array(
    z.object({
      label: z.string(),
      critical: z.number().int(),
      warning: z.number().int(),
      suggestion: z.number().int(),
    }),
  ),
  /** Cost apportioned across findings by category (each finding's share =
   *  its run's cost_usd / that run's findings_count, summed per category) —
   *  a cost-apportionment heuristic, not a claimed true per-category cost. */
  findings_by_category: z.array(z.object({ category: FindingCategory, cost_usd: z.number() })),
  /** This agent's run history across every PR it has reviewed (newest first,
   *  capped), for the Stats tab's run-history table. */
  run_history: z.array(AgentRunSummary),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Per-skill Stats (GET /skills/:id/stats)
// ---------------------------------------------------------------------------

/**
 * A skill has no runs of its own — its stats are derived from the runs of
 * whichever agents have it linked, filtered to the runs where it was
 * actually active (`RunTrace.skills_used` contains this skill's id). Mirrors
 * `AgentStats`'s accept-rate/findings-by-category methodology, just scoped
 * differently (by skill usage across agents, not by agent ownership).
 */
export const SkillStats = z.object({
  skill_id: z.string(),
  skill_name: z.string(),
  agent_count: z.number().int(),
  /** Of the runs by agents linked to this skill, the fraction where it was
   *  actually active (0-1). Null when no linked agent has run yet. */
  pull_rate: z.number().nullable(),
  /** Decided-only accept rate over findings from runs where this skill was
   *  active (0-1). Null when nothing has been accepted/dismissed yet. */
  accept_rate: z.number().nullable(),
  findings_30d: z.number().int(),
  findings_by_category: z.array(z.object({ category: FindingCategory, cost_usd: z.number() })),
  agents: z.array(z.object({ agent_id: z.string(), agent_name: z.string() })),
});
export type SkillStats = z.infer<typeof SkillStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
