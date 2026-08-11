/** Coarse "Xh ago"-style relative time for the scan-header subtitle. */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** SelectInput sentinel for "scan the repo's default branch" (vs. a specific PR number). */
export const DEFAULT_BRANCH_VALUE = "__default__";

/** Parse the PR picker's string value back into a PR number, or null for the default branch. */
export function parsePrSelection(value: string): number | null {
  if (value === DEFAULT_BRANCH_VALUE) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The branch name of the PR a scan targeted, for the GitHub evidence link ref — undefined for a default-branch scan or an unknown PR. */
export function findPrBranch(
  pulls: { number: number; branch: string }[],
  pullNumber: number | null | undefined,
): string | undefined {
  if (pullNumber == null) return undefined;
  return pulls.find((p) => p.number === pullNumber)?.branch;
}
