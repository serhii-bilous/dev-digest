import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM } from "./constants";

/** Confidence-bar color — display only, matches the green/amber/red reading in the design. */
export function confidenceColor(value: number): string {
  if (value >= CONFIDENCE_HIGH) return "var(--ok)";
  if (value >= CONFIDENCE_MEDIUM) return "var(--warn)";
  return "var(--crit)";
}

/** "src/api/users.ts:23-31" (or ":23" when start === end). */
export function evidenceLocation(path: string, start: number, end: number): string {
  return start === end ? `${path}:${start}` : `${path}:${start}-${end}`;
}

/**
 * GitHub "blob" deep link for a piece of evidence, anchored to the exact
 * lines the extractor verified — e.g.
 * `https://github.com/acme/widgets/blob/main/src/api/users.ts#L23-L31`.
 * Candidates are sampled off the repo's default branch, so that's what the
 * link points at (not a specific commit SHA).
 */
export function evidenceGithubUrl(
  repo: { owner: string; name: string; default_branch: string },
  path: string,
  start: number,
  end: number,
): string {
  const lines = start === end ? `L${start}` : `L${start}-L${end}`;
  return `https://github.com/${repo.owner}/${repo.name}/blob/${repo.default_branch}/${path}#${lines}`;
}
