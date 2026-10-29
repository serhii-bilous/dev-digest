/** Abandon a GitHub languages request after this long (NFR-1). */
export const LANGUAGES_FETCH_TIMEOUT_MS = 5_000;

/** An `unknown` stack is re-fetched at most once per this window (AC-44). */
export const UNKNOWN_RETRY_COOLDOWN_MS = 10 * 60_000;
