import type { Container } from '../../platform/container.js';
import type { ConventionCandidate, ConventionScan, RepoRef } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { renderPrompt } from '../../platform/prompts.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import { toConventionDto, toScanDto } from './helpers.js';
import { verifyConventionEvidence } from './evidence.js';
import { ConventionExtractionOutput } from './types.js';
import {
  CONFIG_FILE_CANDIDATES,
  EXTRACTION_SCHEMA_NAME,
  MAX_CANDIDATES,
  SAMPLE_FILE_COUNT,
} from './constants.js';

/**
 * Conventions Extractor — samples a repo's config files + top-ranked source
 * files (deterministic, no model involved in sampling), asks the workspace's
 * configured "conventions" feature model to propose house-style candidates,
 * mechanically verifies each candidate's evidence against the real file
 * content, and persists the survivors. See `evidence.ts` for the verification
 * gate and `repository.ts` for re-scan persistence semantics.
 */

export interface ConventionsListResult {
  candidates: ConventionCandidate[];
  scan: ConventionScan;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private reposRepo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsListResult> {
    const [rows, scanRow] = await Promise.all([
      this.repo.listByRepo(workspaceId, repoId),
      this.repo.latestScan(workspaceId, repoId),
    ]);
    return { candidates: rows.map(toConventionDto), scan: toScanDto(repoId, scanRow) };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { accepted?: boolean; rule?: string },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateOne(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * Run (or re-run) a scan: sample files + configs, extract via LLM, verify
   * evidence, persist. When `pullNumber` is given, samples are read from that
   * PR's head commit instead of whatever the local clone's default branch
   * currently has checked out — via `fetchPullHead` + `readFileAtRef`, which
   * reads git blobs directly without touching the shared clone's working
   * tree (safe alongside other repo-intel/review work on the same clone).
   */
  async extract(workspaceId: string, repoId: string, pullNumber?: number): Promise<ConventionsListResult> {
    const repoRow = await this.reposRepo.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };

    let gitRef: string | null = null;
    if (pullNumber !== undefined) {
      const pull = await this.repo.getPrByNumber(workspaceId, repoId, pullNumber);
      if (!pull) throw new NotFoundError('Pull request not found');
      await this.container.git.fetchPullHead(ref, pullNumber);
      gitRef = pull.headSha;
    }

    const sampledContent = await this.sampleFiles(repoId, ref, gitRef);
    const sampleFileCount = sampledContent.size;

    if (sampleFileCount === 0) {
      // Nothing to analyze (repo not cloned/indexed yet) — record an empty
      // scan instead of calling the model over nothing.
      await this.repo.recordScan(workspaceId, repoId, 0, 0, pullNumber ?? null);
      return this.list(workspaceId, repoId);
    }

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'conventions',
    );
    const llm = await this.container.llm(provider);

    const system = await renderPrompt('conventions.system.md', {
      maxCandidates: String(MAX_CANDIDATES),
    });
    const sampleBlocks = [...sampledContent.entries()]
      .map(([path, content]) => wrapUntrusted(path, `# ${path}\n${content}`))
      .join('\n\n');

    const { data } = await llm.completeStructured<ConventionExtractionOutput>({
      model,
      schema: ConventionExtractionOutput,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `## Sample files\n${sampleBlocks}` },
      ],
    });

    const { kept } = verifyConventionEvidence(
      data.candidates.slice(0, MAX_CANDIDATES),
      sampledContent,
    );

    const inserts: InsertConvention[] = kept.map((c) => ({
      category: c.category,
      rule: c.rule,
      evidencePath: c.evidence_path,
      evidenceLineStart: c.evidence_line_start,
      evidenceLineEnd: c.evidence_line_end,
      evidenceSnippet: c.evidence_snippet,
      confidence: c.confidence,
    }));

    await this.repo.replaceUnaccepted(workspaceId, repoId, inserts);
    await this.repo.recordScan(workspaceId, repoId, sampleFileCount, kept.length, pullNumber ?? null);

    return this.list(workspaceId, repoId);
  }

  /**
   * Config files (probed directly — repoIntel deliberately excludes them) +
   * top-ranked source files. `gitRef` (a PR head sha), when given, reads
   * every sample at that ref instead of the clone's checked-out branch — the
   * ranked path *list* still comes from the repo-intel index (built off the
   * default branch), which is a reasonable approximation: the set of
   * high-signal files rarely differs much on a feature branch.
   */
  private async sampleFiles(
    repoId: string,
    ref: RepoRef,
    gitRef: string | null,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();

    for (const path of CONFIG_FILE_CANDIDATES) {
      const content = await this.readFileSoft(ref, path, gitRef);
      if (content) out.set(path, content);
    }

    const rankedPaths = await this.container.repoIntel.getConventionSamples(
      repoId,
      SAMPLE_FILE_COUNT,
    );
    for (const path of rankedPaths) {
      const content = await this.readFileSoft(ref, path, gitRef);
      if (content) out.set(path, content);
    }

    return out;
  }

  /**
   * Fail-soft file read — a missing config file or an unreadable sample is
   * not an error. Blank content (missing file on some `GitClient`
   * implementations resolves to `''` rather than rejecting) is treated the
   * same as "not found": it carries no evidence either way.
   */
  private async readFileSoft(
    ref: RepoRef,
    path: string,
    gitRef: string | null,
  ): Promise<string | null> {
    try {
      const content = gitRef
        ? await this.container.git.readFileAtRef(ref, gitRef, path)
        : await this.container.git.readFile(ref, path);
      return content.trim().length > 0 ? content : null;
    } catch {
      return null;
    }
  }
}
