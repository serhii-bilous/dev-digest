import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RepoRow, RepoAgentStateRow } from '../../db/rows.js';

/**
 * repo-stack data layer: the language columns of `repos` and the
 * `repo_agent_states` table. Every query is workspace-scoped (repos) or
 * reached only after the repo was resolved in the caller's workspace.
 */
export class RepoStackRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Successful fetch: replace the map and clear any failure. */
  async saveSuccess(
    workspaceId: string,
    repoId: string,
    languages: Record<string, number>,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(t.repos)
      .set({
        languages,
        languagesFetchedAt: at,
        languagesAttemptedAt: at,
        languagesFailure: null,
      })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
  }

  /** Failed fetch: record the reason + attempt time, keep the stored map. */
  async saveFailure(workspaceId: string, repoId: string, reason: string, at: Date): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ languagesFailure: reason, languagesAttemptedAt: at })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
  }

  async listStates(repoId: string): Promise<RepoAgentStateRow[]> {
    return this.db.select().from(t.repoAgentStates).where(eq(t.repoAgentStates.repoId, repoId));
  }

  async upsertState(repoId: string, agentId: string, active: boolean): Promise<void> {
    await this.db
      .insert(t.repoAgentStates)
      .values({ repoId, agentId, active })
      .onConflictDoUpdate({
        target: [t.repoAgentStates.repoId, t.repoAgentStates.agentId],
        set: { active, updatedAt: new Date() },
      });
  }
}
