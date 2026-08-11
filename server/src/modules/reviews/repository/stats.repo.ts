import { and, eq, gte } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunTrace } from '@devdigest/shared';

/** One finding, widened with its owning run's id/cost/count/timestamp — the
 *  join every Stats tab chart (accept rate, findings-by-severity,
 *  findings-by-category) is computed from in application code. */
export interface AgentFindingRow {
  runId: string;
  severity: string;
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
  ranAt: Date | null;
  runCostUsd: number | null;
  runFindingsCount: number | null;
}

const FINDING_SELECT = {
  runId: t.agentRuns.id,
  severity: t.findings.severity,
  category: t.findings.category,
  acceptedAt: t.findings.acceptedAt,
  dismissedAt: t.findings.dismissedAt,
  ranAt: t.agentRuns.ranAt,
  runCostUsd: t.agentRuns.costUsd,
  runFindingsCount: t.agentRuns.findingsCount,
} as const;

/** findings → reviews → agent_runs, filtered to one agent's runs since a
 *  given date. One query, reused in TS for every Stats aggregate that needs
 *  per-finding data (narrower windows are just filtered subsets of this). */
export async function findingsForAgentWindow(
  db: Db,
  workspaceId: string,
  agentId: string,
  sinceDate: Date,
): Promise<AgentFindingRow[]> {
  return db
    .select(FINDING_SELECT)
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        gte(t.agentRuns.ranAt, sinceDate),
      ),
    );
}

/** Same join, workspace-wide (no single-agent filter) — the Skill Stats tab
 *  needs findings across every agent, then filters by "was this skill active
 *  in this run" (via `runTracesForWorkspaceWindow`'s `skills_used`), not by
 *  which agent produced the run. */
export async function findingsForWorkspaceWindow(
  db: Db,
  workspaceId: string,
  sinceDate: Date,
): Promise<AgentFindingRow[]> {
  return db
    .select(FINDING_SELECT)
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), gte(t.agentRuns.ranAt, sinceDate)));
}

/** run_traces for an agent's runs since a given date — read for
 *  `skills_used` tallying (Stats tab's "most-used skills"). */
export async function runTracesForAgentWindow(
  db: Db,
  workspaceId: string,
  agentId: string,
  sinceDate: Date,
): Promise<RunTrace[]> {
  const rows = await db
    .select({ trace: t.runTraces.trace })
    .from(t.runTraces)
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runTraces.runId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        gte(t.agentRuns.ranAt, sinceDate),
      ),
    );
  return rows.map((r) => r.trace as RunTrace);
}

/** run_traces workspace-wide, WITH their run id — the Skill Stats tab needs
 *  to know WHICH runs had a given skill active (`trace.skills_used`), not
 *  just tally ids across an already-known agent's runs. */
export async function runTracesForWorkspaceWindow(
  db: Db,
  workspaceId: string,
  sinceDate: Date,
): Promise<{ runId: string; trace: RunTrace }[]> {
  const rows = await db
    .select({ runId: t.runTraces.runId, trace: t.runTraces.trace })
    .from(t.runTraces)
    .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runTraces.runId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), gte(t.agentRuns.ranAt, sinceDate)));
  return rows.map((r) => ({ runId: r.runId, trace: r.trace as RunTrace }));
}
