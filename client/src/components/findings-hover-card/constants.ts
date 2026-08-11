/** Delay before the card opens on hover — long enough that dragging the
 * pointer across several rows doesn't flash a card (and fire a fetch) over
 * every one it crosses. */
export const HOVER_OPEN_DELAY_MS = 220;

/** Worst-first sort weight. Matches the 3-severity contract (no INFO). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};
