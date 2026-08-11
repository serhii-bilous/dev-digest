import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access — owns `conventions` + `convention_scans`.
 * Workspace(+repo)-scoped throughout, same shape as `SkillsRepository`.
 */

import type { ConventionRow, ConventionScanRow, PullRow } from '../../db/rows.js';
export type { ConventionRow, ConventionScanRow };

export interface InsertConvention {
  category: string;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
  /** Fresh candidates default to accepted (opt-out review flow — see plan). */
  accepted?: boolean;
}

export interface UpdateConvention {
  accepted?: boolean;
  rule?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.scannedAt))
      .limit(1);
    return row;
  }

  /**
   * Re-scan persistence: rows the user already accepted survive untouched;
   * every non-accepted row for the repo is replaced by the fresh scan's kept
   * candidates. Keeps `conventions` free of stale/duplicate proposals across
   * repeated scans while never discarding a reviewed decision.
   */
  async replaceUnaccepted(
    workspaceId: string,
    repoId: string,
    candidates: InsertConvention[],
  ): Promise<ConventionRow[]> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, false),
        ),
      );
    if (candidates.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        candidates.map((c) => ({
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          evidencePath: c.evidencePath,
          evidenceLineStart: c.evidenceLineStart,
          evidenceLineEnd: c.evidenceLineEnd,
          evidenceSnippet: c.evidenceSnippet,
          confidence: c.confidence,
          accepted: c.accepted ?? true,
        })),
      )
      .returning();
  }

  async recordScan(
    workspaceId: string,
    repoId: string,
    sampleFileCount: number,
    candidateCount: number,
    pullNumber?: number | null,
  ): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId, sampleFileCount, candidateCount, pullNumber: pullNumber ?? null })
      .returning();
    return row!;
  }

  /** Look up a PR by its GitHub-facing number (not the row's uuid) for PR-scoped scans. */
  async getPrByNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return row;
  }

  async updateOne(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
