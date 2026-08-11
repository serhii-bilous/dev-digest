import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';

/**
 * Raw LLM-facing extraction output — NOT the shared `ConventionCandidate`
 * contract. No `id`/`accepted` (assigned after persistence) and
 * `evidence_snippet` is intentionally absent: `verifyConventionEvidence`
 * derives it from the real file content instead of trusting the model's
 * quoted text (see `evidence.ts`).
 */
export const RawConventionCandidate = z.object({
  category: ConventionCategory,
  rule: z.string().min(1),
  evidence_path: z.string().min(1),
  evidence_line_start: z.number().int().positive(),
  evidence_line_end: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
});
export type RawConventionCandidate = z.infer<typeof RawConventionCandidate>;

export const ConventionExtractionOutput = z.object({
  candidates: z.array(RawConventionCandidate),
});
export type ConventionExtractionOutput = z.infer<typeof ConventionExtractionOutput>;
