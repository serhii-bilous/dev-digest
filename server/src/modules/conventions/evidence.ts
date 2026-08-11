import type { RawConventionCandidate } from './types.js';

/**
 * Mechanical evidence gate for extracted convention candidates — analogous to
 * (but distinct from) `reviewer-core`'s `groundFindings`: that gate checks a
 * finding's line range against diff hunks, this one checks a candidate's line
 * range against the REAL content of the sampled file on disk. A candidate is
 * kept only if its `evidence_path` was actually sampled and its line range
 * exists in that file; `evidence_snippet` is then derived from the real file
 * slice, never trusted from the model, so nothing hallucinated reaches the UI.
 */

export interface VerifiedConventionCandidate extends RawConventionCandidate {
  evidence_snippet: string;
}

export interface EvidenceVerificationResult {
  kept: VerifiedConventionCandidate[];
  dropped: { candidate: RawConventionCandidate; reason: string }[];
}

const MAX_SNIPPET_CHARS = 600;
/** A candidate citing an implausibly large range is more likely mis-cited than a real convention. */
const MAX_LINE_SPAN = 40;

export function verifyConventionEvidence(
  candidates: RawConventionCandidate[],
  sampledContent: Map<string, string>,
): EvidenceVerificationResult {
  const kept: VerifiedConventionCandidate[] = [];
  const dropped: EvidenceVerificationResult['dropped'] = [];

  for (const candidate of candidates) {
    const content = sampledContent.get(candidate.evidence_path);
    if (content === undefined) {
      dropped.push({ candidate, reason: `file '${candidate.evidence_path}' was not sampled` });
      continue;
    }

    const lines = content.split('\n');
    const start = Math.min(candidate.evidence_line_start, candidate.evidence_line_end);
    const end = Math.max(candidate.evidence_line_start, candidate.evidence_line_end);

    if (start < 1 || end > lines.length) {
      dropped.push({
        candidate,
        reason: `lines ${start}-${end} out of range for '${candidate.evidence_path}' (${lines.length} lines)`,
      });
      continue;
    }
    if (end - start + 1 > MAX_LINE_SPAN) {
      dropped.push({
        candidate,
        reason: `line range ${start}-${end} exceeds ${MAX_LINE_SPAN} lines`,
      });
      continue;
    }

    const snippet = lines
      .slice(start - 1, end)
      .join('\n')
      .slice(0, MAX_SNIPPET_CHARS);
    if (snippet.trim().length === 0) {
      dropped.push({
        candidate,
        reason: `lines ${start}-${end} in '${candidate.evidence_path}' are blank`,
      });
      continue;
    }

    kept.push({
      ...candidate,
      evidence_line_start: start,
      evidence_line_end: end,
      evidence_snippet: snippet,
    });
  }

  return { kept, dropped };
}
