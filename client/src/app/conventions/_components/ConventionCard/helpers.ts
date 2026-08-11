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
