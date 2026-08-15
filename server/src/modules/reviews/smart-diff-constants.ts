/**
 * Smart Diff classifier constants. Deterministic path/pattern rules — no LLM
 * involved. Precedence when a path matches more than one list: BOILERPLATE
 * patterns are checked first (strongest, lowest-risk signal), then WIRING,
 * everything else defaults to CORE.
 */

// ---- boilerplate: lockfiles ------------------------------------------------
export const LOCKFILE_BASENAMES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
  'go.sum',
  'mix.lock',
] as const;

// ---- boilerplate: generated/build output & vendored code ------------------
export const BOILERPLATE_DIR_SEGMENTS = [
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  'generated',
  '__generated__',
  '__snapshots__',
  'vendor',
] as const;

export const BOILERPLATE_SUFFIXES = ['.snap', '.min.js', '.min.css', '.map'] as const;

// ---- wiring: config / registration / DI ------------------------------------
export const WIRING_BASENAME_PATTERNS = [
  /^index\.[jt]sx?$/, // barrels
  /^routes\.ts$/, // HTTP wiring layer (business logic lives in service.ts)
  /(^|\.)config\.[cm]?[jt]sx?$/, // config.ts, vite.config.ts, next.config.js, ...
  /^tsconfig.*\.json$/,
  /^\.eslintrc.*$/,
  /^\.prettierrc.*$/,
  /^(container|di|bootstrap|registry|app|main|server)\.[jt]s$/,
] as const;

export const WIRING_DIR_SEGMENTS = ['migrations', 'drizzle'] as const;

// ---- split-suggestion thresholds -------------------------------------------
/** Reviewable-line threshold (core+wiring only — boilerplate churn like a
 *  lockfile bump must never make a small logic change look "too big"). */
export const SMART_DIFF_TOO_BIG_LINE_THRESHOLD = 500;
/** Only propose a split for a directory group at least this big. */
export const SMART_DIFF_MIN_SPLIT_GROUP_LINES = 50;
/** Cap the number of proposed splits so this never floods the UI. */
export const SMART_DIFF_MAX_PROPOSED_SPLITS = 5;
