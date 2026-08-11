/** How many top-ranked source files (via `repoIntel.getConventionSamples`) to sample per scan. */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Common eslint/tsconfig/prettier filenames to probe at the repo root.
 * `repoIntel.getConventionSamples` deliberately excludes these (they're junk
 * for its onboarding/blast-radius consumers), so conventions reads them
 * directly — they're strong, code-only evidence of house style.
 */
export const CONFIG_FILE_CANDIDATES = [
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
] as const;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Cap on kept candidates per scan, so one over-eager model call can't flood the list. */
export const MAX_CANDIDATES = 20;
