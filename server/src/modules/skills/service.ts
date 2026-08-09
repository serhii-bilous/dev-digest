import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { deriveNameFromMarkdown, toSkillDto, toSkillVersionDto } from './helpers.js';
import { buildSkillStats, computeQuickStatsForAllSkills } from './stats.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STATS_WINDOW_DAYS = 30;

/**
 * A1 — skills service. Business logic for the standalone Skills page and the
 * Agent Editor's Skills tab (which reads skills via `list`/`get` but attaches
 * them through the agents module's own link endpoints).
 *
 * A Skill = type + source + body (markdown) + enabled + linked-per-agent.
 * Body/name/description/type changes are versioned via `skill_versions`.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface ImportSkillFileInput {
  name?: string;
  body: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** List every skill, each with lightweight usage stats attached (agent
   *  count / pull rate / accept rate) for the list cards — computed once
   *  across all skills, not per-card. */
  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, quickStats] = await Promise.all([
      this.repo.list(workspaceId),
      computeQuickStatsForAllSkills(this.container, workspaceId),
    ]);
    return rows.map((row) => {
      const dto = toSkillDto(row);
      const stats = quickStats.get(row.id);
      return stats ? { ...dto, ...stats } : dto;
    });
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'manual',
      body: input.body,
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Import a skill from a markdown file. The file is read client-side (a
   * FileReader text extraction, not a server upload) and posted as plain
   * text — this endpoint only persists it. `source: 'extracted'` records the
   * provenance; unlike a future URL/community import, a file the user picked
   * and reviewed themselves is trusted enough to start `enabled`.
   */
  async importFile(workspaceId: string, input: ImportSkillFileInput): Promise<Skill> {
    const name = input.name?.trim() || deriveNameFromMarkdown(input.body);
    const row = await this.repo.insert({
      workspaceId,
      name,
      description: '',
      type: 'custom',
      source: 'extracted' as SkillSource,
      body: input.body,
      enabled: true,
    });
    return toSkillDto(row);
  }

  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /** Stats tab aggregate (`GET /skills/:id/stats`). */
  async getStats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;

    const since = new Date(Date.now() - STATS_WINDOW_DAYS * DAY_MS);
    const linkedAgents = await this.container.agentsRepo.agentsLinkingSkill(workspaceId, skillId);

    const [linkedAgentRuns, workspaceFindings, workspaceTraces] = await Promise.all([
      Promise.all(
        linkedAgents.map((a) =>
          this.container.reviewRepo.listRunsForAgent(workspaceId, a.agentId, { sinceDate: since }),
        ),
      ),
      this.container.reviewRepo.findingsForWorkspaceWindow(workspaceId, since),
      this.container.reviewRepo.runTracesForWorkspaceWindow(workspaceId, since),
    ]);

    return buildSkillStats({
      skillId,
      skillName: skill.name,
      linkedAgents,
      linkedAgentRunIds: linkedAgentRuns.flat().map((r) => r.run_id),
      workspaceFindings,
      workspaceTraces,
    });
  }
}
