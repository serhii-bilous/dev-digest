/** Constants for the evals module. */

/**
 * The isolated test harness a SKILL-owned eval case runs through — a fixed,
 * generic reviewer with ONLY the target skill's body injected. Tests the
 * skill's own detection quality independent of any specific agent, since a
 * skill alone has no provider/model/system prompt of its own. Matches the
 * default provider/model `server/src/db/seed.ts` seeds built-in agents with.
 */
export const HARNESS_PROVIDER = 'openrouter' as const;
export const HARNESS_MODEL = 'deepseek/deepseek-v4-flash';
export const HARNESS_SYSTEM_PROMPT =
  'You are a code reviewer running a single rule in isolation. Apply ONLY ' +
  "the rule(s) in the Skills section below to the diff — do not invent " +
  'issues outside that rule\'s scope. Return findings strictly according to ' +
  'what the rule asks you to check for.';
