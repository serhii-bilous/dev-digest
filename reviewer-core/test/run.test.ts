import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';
import { MAP_REDUCE_CONCURRENCY } from '../src/review/run.js';

/** A synthetic multi-file diff whose `raw` text is big enough to exceed a
 *  small `modelContextLength` at the engine's conservative ~3-chars/token
 *  estimate, so the context-fallback path in selectMode() actually triggers. */
function bigDiff(fileCount: number, charsPerFile: number): UnifiedDiff {
  const files = Array.from({ length: fileCount }, (_, i) => ({
    path: `src/file${i}.ts`,
    additions: 100,
    deletions: 0,
    hunks: [
      {
        file: `src/file${i}.ts`,
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 100,
        newLineNumbers: Array.from({ length: 100 }, (_, n) => n + 1),
      },
    ],
  }));
  const raw = files
    .map((f) => `diff --git a/${f.path} b/${f.path}\n` + '+x\n'.repeat(charsPerFile / 3))
    .join('\n');
  return { raw, files };
}

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('map-reduce mode: checkCancelled still fires per-chunk when chunks run concurrently', async () => {
    // Same intent as "checkCancelled throwing aborts before the LLM call"
    // above, but for the concurrent map-reduce path (mapWithConcurrency) —
    // the checkpoint lives inside reviewChunk, called once per chunk, and
    // must still abort the whole run even though chunks are in flight
    // together rather than strictly serially.
    const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = bigDiff(3, 100);
    let calls = 0;
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm,
        strategy: 'map-reduce',
        checkCancelled: () => {
          calls++;
          if (calls === 2) throw new Error('cancelled mid map-reduce');
        },
      }),
    ).rejects.toThrow('cancelled mid map-reduce');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  it('forwards intent into the assembled prompt (## Stated PR intent section)', async () => {
    const seenMessages: { role: string; content: string }[][] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seenMessages.push(req.messages);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm: recorder,
      intent: 'Only refactor the config loader; do not add new features.',
    });

    expect(seenMessages.length).toBeGreaterThan(0);
    const user = seenMessages[0]![1]!.content;
    expect(user).toContain('## Stated PR intent');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain('Only refactor the config loader; do not add new features.');
  });

  describe('context-length fallback (strategy vs. a small-context model)', () => {
    const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

    it('single-pass falls back to map-reduce when the diff clearly will not fit modelContextLength', async () => {
      const llm = new MockLLMProvider('openai', { structured: clean });
      const diff = bigDiff(3, 60_000); // ~20k tokens/file at the ~3 chars/token estimate

      const events: string[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'qwen/qwen-2.5-7b-instruct',
        diff,
        llm,
        strategy: 'single-pass',
        modelContextLength: 32_768,
        onEvent: (e) => events.push(e.msg),
      });

      expect(outcome.mode).toBe('map-reduce');
      expect(outcome.chunks).toHaveLength(3);
      expect(events.some((m) => m.includes("qwen/qwen-2.5-7b-instruct's context window"))).toBe(true);
    });

    it('single-pass stays single-pass on the same diff when modelContextLength is unknown (pre-existing behaviour)', async () => {
      const llm = new MockLLMProvider('openai', { structured: clean });
      const diff = bigDiff(3, 60_000);

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'qwen/qwen-2.5-7b-instruct',
        diff,
        llm,
        strategy: 'single-pass',
        // no modelContextLength supplied
      });

      expect(outcome.mode).toBe('single-pass');
      expect(outcome.chunks).toHaveLength(1);
    });

    it('single-pass stays single-pass when the diff comfortably fits modelContextLength', async () => {
      const llm = new MockLLMProvider('openai', { structured: clean });
      const diff = await new MockGitClient().diff(); // small fixture diff

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        strategy: 'single-pass',
        modelContextLength: 128_000,
      });

      expect(outcome.mode).toBe('single-pass');
    });

    it("'auto' also falls back to map-reduce when the diff would not fit, even under the line threshold", async () => {
      const llm = new MockLLMProvider('openai', { structured: clean });
      // 2 files, small line counts (under DEFAULT_MAP_THRESHOLD_LINES=400) but
      // each file's raw text is large — auto's line-count check alone would
      // pick single-pass; the context check must still catch it.
      const diff = bigDiff(2, 60_000);

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'qwen/qwen-2.5-7b-instruct',
        diff,
        llm,
        strategy: 'auto',
        modelContextLength: 32_768,
      });

      expect(outcome.mode).toBe('map-reduce');
    });
  });

  describe('map-reduce chunk failures', () => {
    const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

    it('isolates one failing chunk: the review still reduces from the surviving chunks', async () => {
      const diff = bigDiff(3, 100);
      let calls = 0;
      const flaky: LLMProvider = {
        id: 'openrouter',
        async completeStructured<T>(req): Promise<StructuredResult<T>> {
          calls++;
          if (calls === 1) throw new Error('malformed structured output');
          return {
            data: clean as unknown as T,
            model: req.model,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: 0,
            raw: '',
            attempts: 1,
          };
        },
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('not used');
        },
        async embed() {
          return [];
        },
      };

      const events: string[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm: flaky,
        strategy: 'map-reduce',
        onEvent: (e) => events.push(e.msg),
      });

      expect(outcome.review.verdict).toBe('approve');
      expect(events.some((m) => m.includes('1/3 chunk(s) failed and were skipped'))).toBe(true);
    });

    it('throws when every map-reduce chunk fails, instead of silently returning a clean review', async () => {
      const diff = bigDiff(2, 100);
      const alwaysFails: LLMProvider = {
        id: 'openrouter',
        async completeStructured(): Promise<never> {
          throw new Error('provider unavailable');
        },
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('not used');
        },
        async embed() {
          return [];
        },
      };

      await expect(
        reviewPullRequest({
          systemPrompt: 's',
          model: 'm',
          diff,
          llm: alwaysFails,
          strategy: 'map-reduce',
        }),
      ).rejects.toThrow('All 2 map-reduce chunk(s) failed');
    });
  });

  describe('mapWithConcurrency bound (via reviewPullRequest map-reduce)', () => {
    it('never runs more than MAP_REDUCE_CONCURRENCY LLM calls at once, and still reviews every file', async () => {
      const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
      const fileCount = 10; // > MAP_REDUCE_CONCURRENCY (8)
      const diff = bigDiff(fileCount, 30); // small padding — only file COUNT matters here

      let inFlight = 0;
      let maxInFlight = 0;
      const tracking: LLMProvider = {
        id: 'openrouter',
        async completeStructured<T>(req): Promise<StructuredResult<T>> {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight--;
          return {
            data: clean as unknown as T,
            model: req.model,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: 0,
            raw: '',
            attempts: 1,
          };
        },
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('not used');
        },
        async embed() {
          return [];
        },
      };

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm: tracking,
        strategy: 'map-reduce',
      });

      expect(maxInFlight).toBeLessThanOrEqual(MAP_REDUCE_CONCURRENCY);
      // With 10 files and a limit of 8, the bound should actually be reached
      // (not accidentally serialized) — asserts the pool is bounded, not zero.
      expect(maxInFlight).toBe(MAP_REDUCE_CONCURRENCY);
      expect(outcome.chunks).toHaveLength(fileCount);
      expect(outcome.review.verdict).toBe('approve');
    });
  });

  describe('isLargeDiff threshold boundary (via reviewPullRequest strategy: auto)', () => {
    const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

    /** A multi-file diff with a precisely controlled total additions+deletions count. */
    function preciseDiff(fileLineCounts: number[]): UnifiedDiff {
      const files = fileLineCounts.map((n, i) => ({
        path: `src/f${i}.ts`,
        additions: n,
        deletions: 0,
        hunks: [
          {
            file: `src/f${i}.ts`,
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: n,
            newLineNumbers: Array.from({ length: n }, (_, k) => k + 1),
          },
        ],
      }));
      const raw = files.map((f) => `diff --git a/${f.path} b/${f.path}\n`).join('\n');
      return { raw, files };
    }

    it('total lines exactly AT the threshold stays single-pass (isLargeDiff requires strictly >)', async () => {
      const llm = new MockLLMProvider('openai', { structured: clean });
      const diff = preciseDiff([5, 5]); // total = 10 = threshold

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm,
        strategy: 'auto',
        mapThresholdLines: 10,
      });

      expect(outcome.mode).toBe('single-pass');
    });

    it('total lines one over the threshold resolves to map-reduce', async () => {
      const llm = new MockLLMProvider('openai', { structured: clean });
      const diff = preciseDiff([5, 6]); // total = 11 > threshold

      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff,
        llm,
        strategy: 'auto',
        mapThresholdLines: 10,
      });

      expect(outcome.mode).toBe('map-reduce');
    });
  });
});
