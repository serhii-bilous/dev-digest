import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  AgentVersionConfig,
  EvalRun,
  FeatureModelChoice,
  LOCAL_MODEL_ALIASES,
  RunSummary,
  refineAgentProviderModel,
} from '@devdigest/shared';

const Body = z
  .object({ provider: z.string(), model: z.string() })
  .superRefine(refineAgentProviderModel);

describe('local provider contracts', () => {
  it.each(LOCAL_MODEL_ALIASES)('accepts local alias %s', (model) => {
    expect(Body.safeParse({ provider: 'local', model }).success).toBe(true);
  });

  it('rejects a non-alias model for local agents', () => {
    const r = Body.safeParse({ provider: 'local', model: 'gpt-4o' });
    expect(r.success).toBe(false);
  });

  it('does not constrain models of API providers', () => {
    expect(Body.safeParse({ provider: 'openai', model: 'gpt-4o' }).success).toBe(true);
  });

  it('applies the refinement to AgentVersionConfig', () => {
    const base = {
      system_prompt: 'x',
      strategy: 'auto',
      ci_fail_on: 'critical',
      repo_intel: true,
      skills: [],
    };
    expect(AgentVersionConfig.safeParse({ ...base, provider: 'local', model: 'bogus' }).success).toBe(false);
    expect(AgentVersionConfig.safeParse({ ...base, provider: 'local', model: 'opus' }).success).toBe(true);
  });

  it('rejects local for feature models', () => {
    expect(FeatureModelChoice.safeParse({ provider: 'local', model: 'opus' }).success).toBe(false);
    expect(FeatureModelChoice.safeParse({ provider: 'openai', model: 'gpt-4o' }).success).toBe(true);
  });

  it('AgentManifest rejects local with a clear message', () => {
    const r = AgentManifest.safeParse({ name: 'a', provider: 'local', model: 'opus', system_prompt: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Local agents can't run in CI");
    expect(AgentManifest.safeParse({ name: 'a', model: 'm', system_prompt: '' }).success).toBe(true);
  });

  it('defaults billing to api on old payloads', () => {
    const run = EvalRun.parse({
      recall: 1, precision: 1, citation_accuracy: 1, traces_passed: 1, traces_total: 1,
      duration_ms: 1, cost_usd: null, per_trace: [],
    });
    expect(run.billing).toBe('api');
    const summary = RunSummary.parse({
      run_id: 'r', agent_id: null, agent_name: null, provider: null, model: null, status: null,
      error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null,
      findings_count: null, grounding: null, ran_at: null, score: null, blockers: null,
      critical_count: null, warning_count: null, suggestion_count: null,
    });
    expect(summary.billing).toBe('api');
    expect(summary.queued_for_local).toBe(false);
  });
});
