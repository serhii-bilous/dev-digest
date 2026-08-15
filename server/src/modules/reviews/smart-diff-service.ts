import type { SmartDiff, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { ReviewRepository } from './repository.js';
import { classifyFile, buildSplitSuggestion } from './smart-diff-classifier.js';

const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/**
 * Builds the `SmartDiff` view for a PR: files classified into core/wiring/
 * boilerplate groups, each annotated with the line numbers of any findings
 * already on that file. Deterministic and read-only — no LLM call, no
 * GitHub round trip. `pseudocode_summary` is always left null (that would
 * require an LLM call, out of scope for this feature).
 */
export async function buildSmartDiff(
  repo: ReviewRepository,
  workspaceId: string,
  prId: string,
): Promise<SmartDiff> {
  const pull = await repo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');

  const [files, reviewRows] = await Promise.all([repo.getPrFiles(prId), repo.reviewsForPull(prId)]);

  // Every finding from every review on the PR, unfiltered — same rule the PR
  // detail page itself uses for its own findings rollup (allFindings).
  const allFindings = reviewRows.flatMap((r) => r.findings);

  const classified = files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    role: classifyFile(f.path),
  }));

  const groups: SmartDiffGroup[] = ROLE_ORDER.map((role) => ({
    role,
    files: classified
      .filter((f) => f.role === role)
      .map((f) => ({
        path: f.path,
        pseudocode_summary: null,
        additions: f.additions,
        deletions: f.deletions,
        finding_lines: [
          ...new Set(
            allFindings.filter((fd) => fd.file === f.path).map((fd) => fd.startLine),
          ),
        ].sort((a, b) => a - b),
      })),
  }));

  return {
    groups,
    split_suggestion: buildSplitSuggestion(classified),
  };
}
