import type { ConventionCandidate } from "@devdigest/shared";

/** "acme/payments-api" -> "payments-api" (falls back to the input unchanged). */
export function repoSlug(repoName: string): string {
  const last = repoName.split("/").pop();
  return (last || repoName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Rough token estimate (chars/4) — matches ConfigTab's editor-chrome estimate. */
export function estimateTokens(body: string): number {
  return Math.ceil(body.length / 4);
}

/**
 * Merge accepted convention candidates into one skill body markdown doc:
 * a heading + framing sentence, then one `## {rule}` section per candidate
 * citing its verified `file:line` evidence and code snippet.
 */
export function buildSkillBodyFromConventions(
  candidates: ConventionCandidate[],
  repoName: string,
): string {
  const slug = repoSlug(repoName);
  const lines: string[] = [
    `# ${slug}-conventions`,
    "",
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
  ];

  for (const c of candidates) {
    const location =
      c.evidence_line_start === c.evidence_line_end
        ? `${c.evidence_path}:${c.evidence_line_start}`
        : `${c.evidence_path}:${c.evidence_line_start}-${c.evidence_line_end}`;
    lines.push("", `## ${c.rule}`, "", `Detected in \`${location}\`:`, "", "```", c.evidence_snippet, "```");
  }

  return lines.join("\n");
}

/** Distinct evidence file paths behind a set of candidates — for `evidence_files`. */
export function uniqueEvidenceFiles(candidates: ConventionCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.evidence_path))];
}
