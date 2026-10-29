import type { Container } from '../../platform/container.js';
import { randomUUID } from 'node:crypto';
import type { LocalFailureReason, Provider } from '@devdigest/shared';
import { LocalProviderError, billingFor, type LocalLogger } from '../../platform/local-errors.js';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { AgentRow, EvalCaseRow, SkillRow } from '../../db/rows.js';
import { resolveEnabledSkills } from '../agents/helpers.js';
import { HARNESS_MODEL, HARNESS_PROVIDER, HARNESS_SYSTEM_PROMPT } from './constants.js';
import { gradeEvalCase, type FindingDescriptor, type GradingResult } from './grading.js';

export interface EvalRunOutcome {
  /** 'subscription' when the case ran through Local (cost is 0, not billed). */
  billing: 'api' | 'subscription';
  /** Set when a Local call failed (AC-27): recorded on the run, never thrown. */
  failure?: { reason: LocalFailureReason; error: string };
  actualOutput: FindingDescriptor[];
  metrics: GradingResult;
}

interface ReviewConfig {
  systemPrompt: string;
  model: string;
  provider: Provider;
  skills: string[];
}

/**
 * Shared execute+grade glue: parse the case's diff, run it through the given
 * reviewer config (the same `reviewPullRequest` call `run-executor.ts` makes
 * for a real PR review — no separate eval engine), grade the grounded
 * findings against `expected_output`. Used by both `runEvalCase` (agent) and
 * `runSkillEvalCase` (isolated harness) so neither duplicates this logic.
 */
async function executeAndGrade(
  container: Container,
  config: ReviewConfig,
  evalCase: EvalCaseRow,
  logger?: LocalLogger,
): Promise<EvalRunOutcome> {
  const started = Date.now();
  try {
    return await executeAndGradeInner(container, config, evalCase, logger);
  } catch (err) {
    // NFR-8: a Local failure is recorded on the run, never an HTTP 5xx.
    if (!(err instanceof LocalProviderError)) throw err;
    return {
      billing: 'subscription',
      failure: { reason: err.reason, error: `${err.reason}: ${err.message}` },
      actualOutput: [],
      metrics: { recall: 0, precision: 0, citation_accuracy: 0, pass: false, duration_ms: Date.now() - started, cost_usd: null },
    };
  }
}

async function executeAndGradeInner(
  container: Container,
  config: ReviewConfig,
  evalCase: EvalCaseRow,
  logger?: LocalLogger,
): Promise<EvalRunOutcome> {
  const start = Date.now();
  // Local evals keep the 300 s timeout and the 2-slot cap but are not
  // cancellable (no signal). `runId` only labels the one NFR-10 log line.
  const llm = await container.llmFor(config.provider, {
    runId: `eval:${evalCase.id}:${randomUUID()}`,
    ...(logger ? { logger } : {}),
  });
  const diff = parseUnifiedDiff(evalCase.inputDiff ?? '');

  const outcome = await reviewPullRequest({
    systemPrompt: config.systemPrompt,
    model: config.model,
    diff,
    llm,
    ...(config.skills.length > 0 ? { skills: config.skills } : {}),
    task: `Eval case: ${evalCase.name}`,
  });
  const durationMs = Date.now() - start;

  const actualOutput: FindingDescriptor[] = outcome.review.findings.map((f) => ({
    severity: f.severity,
    category: f.category,
  }));
  const expected = (
    Array.isArray(evalCase.expectedOutput) ? evalCase.expectedOutput : []
  ) as FindingDescriptor[];

  const metrics = gradeEvalCase(
    expected,
    actualOutput,
    { kept: outcome.review.findings.length, dropped: outcome.dropped.length },
    durationMs,
    outcome.costUsd,
  );

  return { actualOutput, metrics, billing: billingFor(config.provider) };
}

/** Run one eval case owned by an AGENT: the agent's real provider/model/
 *  system prompt/enabled skills. */
export async function runEvalCase(
  container: Container,
  agent: AgentRow,
  evalCase: EvalCaseRow,
  logger?: LocalLogger,
): Promise<EvalRunOutcome> {
  const skills = await resolveEnabledSkills(container.agentsRepo, agent.id);
  return executeAndGrade(
    container,
    {
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      provider: agent.provider as Provider,
      skills: skills.map((s) => s.body),
    },
    evalCase,
    logger,
  );
}

/** Run one eval case owned by a SKILL: the isolated test harness — a fixed
 *  generic reviewer with ONLY this skill's body injected. */
export async function runSkillEvalCase(
  container: Container,
  skill: SkillRow,
  evalCase: EvalCaseRow,
  logger?: LocalLogger,
): Promise<EvalRunOutcome> {
  return executeAndGrade(
    container,
    {
      systemPrompt: HARNESS_SYSTEM_PROMPT,
      model: HARNESS_MODEL,
      provider: HARNESS_PROVIDER,
      skills: [skill.body],
    },
    evalCase,
    logger,
  );
}
