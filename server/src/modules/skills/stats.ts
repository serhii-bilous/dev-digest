import type { Container } from '../../platform/container.js';
import type { FindingCategory, RunTrace, SkillStats } from '@devdigest/shared';
import type { AgentFindingRow } from '../reviews/repository/stats.repo.js';

/**
 * Pure Skill-Stats aggregation — a skill has no runs of its own, so its
 * stats are derived from the runs of whichever agents currently link it,
 * filtered to the runs where it was actually active (`RunTrace.skills_used`
 * contains this skill's id — a skill could be linked today but have been
 * disabled/unlinked when a given historical run happened). Mirrors
 * `agents/stats.ts`'s accept-rate / findings-by-category methodology.
 *
 * Windowing: a single trailing 30-day window for everything (no run-history
 * table or severity-weekly chart on this tab, so no need for the agent
 * Stats tab's 60d-delta / 6-week-bucket machinery).
 */

export interface SkillStatsInputs {
  skillId: string;
  skillName: string;
  linkedAgents: { agentId: string; agentName: string }[];
  /** Run ids belonging to `linkedAgents`, within the stats window — the
   *  pull-rate denominator. */
  linkedAgentRunIds: string[];
  /** Findings (joined w/ their run), workspace-wide, within the window —
   *  filtered down to the runs this skill was actually pulled into. */
  workspaceFindings: AgentFindingRow[];
  /** Run traces, workspace-wide, within the window, WITH their run id. */
  workspaceTraces: { runId: string; trace: RunTrace }[];
}

export function buildSkillStats(inputs: SkillStatsInputs): SkillStats {
  const { skillId, skillName, linkedAgents, linkedAgentRunIds, workspaceFindings, workspaceTraces } =
    inputs;

  const linkedRunIdSet = new Set(linkedAgentRunIds);
  const pulledRunIds = new Set(
    workspaceTraces
      .filter((t) => linkedRunIdSet.has(t.runId) && (t.trace.skills_used ?? []).includes(skillId))
      .map((t) => t.runId),
  );
  const pullRate = linkedRunIdSet.size > 0 ? pulledRunIds.size / linkedRunIdSet.size : null;

  const relevantFindings = workspaceFindings.filter((f) => pulledRunIds.has(f.runId));
  const accepted = relevantFindings.filter((f) => f.acceptedAt != null).length;
  const dismissed = relevantFindings.filter((f) => f.dismissedAt != null).length;
  const decided = accepted + dismissed;
  const acceptRate = decided > 0 ? accepted / decided : null;

  const categoryCost = new Map<string, number>();
  for (const f of relevantFindings) {
    if (f.runCostUsd == null || !f.runFindingsCount) continue;
    const share = f.runCostUsd / f.runFindingsCount;
    categoryCost.set(f.category, (categoryCost.get(f.category) ?? 0) + share);
  }
  const findingsByCategory = [...categoryCost.entries()].map(([category, cost_usd]) => ({
    category: category as FindingCategory,
    cost_usd,
  }));

  return {
    skill_id: skillId,
    skill_name: skillName,
    agent_count: linkedAgents.length,
    pull_rate: pullRate,
    accept_rate: acceptRate,
    findings_30d: relevantFindings.length,
    findings_by_category: findingsByCategory,
    agents: linkedAgents.map((a) => ({ agent_id: a.agentId, agent_name: a.agentName })),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_STATS_WINDOW_DAYS = 30;

export interface QuickSkillStats {
  agent_count: number;
  pull_rate: number | null;
  accept_rate: number | null;
}

/**
 * Lightweight per-skill stats for EVERY skill in a workspace at once — the
 * Skills list page's "N agents · NN% pull · NN% accept" card line. Fetches
 * the workspace-wide window data ONCE (shared across every skill) and the
 * per-agent run counts ONCE per distinct linked agent (not per skill), then
 * reuses `buildSkillStats`'s exact math per skill so this never drifts from
 * the full Stats-tab computation.
 */
export async function computeQuickStatsForAllSkills(
  container: Container,
  workspaceId: string,
): Promise<Map<string, QuickSkillStats>> {
  const links = await container.agentsRepo.allAgentSkillLinksForWorkspace(workspaceId);
  if (links.length === 0) return new Map();

  const now = new Date();
  const since = new Date(now.getTime() - QUICK_STATS_WINDOW_DAYS * DAY_MS);

  const [workspaceFindings, workspaceTraces] = await Promise.all([
    container.reviewRepo.findingsForWorkspaceWindow(workspaceId, since),
    container.reviewRepo.runTracesForWorkspaceWindow(workspaceId, since),
  ]);

  const uniqueAgentIds = [...new Set(links.map((l) => l.agentId))];
  const runIdsByAgent = new Map<string, string[]>();
  await Promise.all(
    uniqueAgentIds.map(async (agentId) => {
      const runs = await container.reviewRepo.listRunsForAgent(workspaceId, agentId, { sinceDate: since });
      runIdsByAgent.set(agentId, runs.map((r) => r.run_id));
    }),
  );

  const agentsBySkill = new Map<string, { agentId: string; agentName: string }[]>();
  for (const link of links) {
    const list = agentsBySkill.get(link.skillId) ?? [];
    list.push({ agentId: link.agentId, agentName: link.agentName });
    agentsBySkill.set(link.skillId, list);
  }

  const result = new Map<string, QuickSkillStats>();
  for (const [skillId, linkedAgents] of agentsBySkill) {
    const linkedAgentRunIds = linkedAgents.flatMap((a) => runIdsByAgent.get(a.agentId) ?? []);
    const stats = buildSkillStats({
      skillId,
      skillName: '',
      linkedAgents,
      linkedAgentRunIds,
      workspaceFindings,
      workspaceTraces,
    });
    result.set(skillId, {
      agent_count: stats.agent_count,
      pull_rate: stats.pull_rate,
      accept_rate: stats.accept_rate,
    });
  }
  return result;
}
