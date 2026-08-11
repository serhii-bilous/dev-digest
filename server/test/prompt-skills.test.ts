import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';

/**
 * L02 — skill-bodies-in-prompt assembly (pure, no LLM).
 *
 * `assemblePrompt` renders linked skill bodies as `## Skills / rules`, joined
 * with a blank line, positioned after `## PR description` and before
 * `## Relevant memory`. Unlike callers/specs/diff, skill bodies are NOT
 * wrapped in `<untrusted>` delimiters — treated as trusted-ish curated
 * content (per `prompt.ts`'s own doc comment).
 *
 * No I/O. The function is pure; we assert text exactly.
 */

const COMMON = {
  system: 'You are a reviewer.',
  memory: ['Do not flag try/catch around JSON.parse'],
  specs: ['# Security baseline\nNo secrets in code.'],
  diff: '@@ -1 +1 @@\n+stripeKey',
  task: "Review PR #482 'rate limit'",
} as const;

describe('assemblePrompt + skills', () => {
  it('renders ## Skills / rules with the joined bodies, unwrapped (not <untrusted>)', () => {
    const skills = ['## no-then-chains\nUse async/await.', '## secret-leakage-gate\nFlag hardcoded keys.'];
    const { messages } = assemblePrompt({ ...COMMON, skills });
    const user = messages[1]!.content;

    expect(user).toContain('## Skills / rules\n## no-then-chains\nUse async/await.\n\n## secret-leakage-gate\nFlag hardcoded keys.');
    // Not delimiter-wrapped, unlike specs/diff.
    expect(user).not.toContain('<untrusted source="skills"');
  });

  it('positions Skills AFTER PR description and BEFORE Relevant memory', () => {
    const { messages } = assemblePrompt({
      ...COMMON,
      skills: ['## skill\nDetect X'],
      prDescription: 'This PR adds rate limiting.',
    });
    const user = messages[1]!.content;

    const idxPrDesc = user.indexOf('## PR description');
    const idxSkills = user.indexOf('## Skills / rules');
    const idxMemory = user.indexOf('## Relevant memory');
    expect(idxPrDesc).toBeGreaterThan(-1);
    expect(idxSkills).toBeGreaterThan(idxPrDesc);
    expect(idxMemory).toBeGreaterThan(idxSkills);
  });

  it('omits the section when skills is undefined (byte-identical user message)', () => {
    const a = assemblePrompt({ ...COMMON });
    const b = assemblePrompt({ ...COMMON, skills: undefined });
    expect(a.messages[1]!.content).toBe(b.messages[1]!.content);
    expect(a.messages[1]!.content).not.toContain('## Skills / rules');
  });

  it('omits the section when skills is an empty array', () => {
    const base = assemblePrompt({ ...COMMON });
    const empty = assemblePrompt({ ...COMMON, skills: [] });
    expect(empty.messages[1]!.content).toBe(base.messages[1]!.content);
  });

  it('the assembly trace record carries the joined skills block, null when absent', () => {
    const withSkills = assemblePrompt({ ...COMMON, skills: ['## skill\nDetect X'] });
    expect(withSkills.assembly.skills).toBe('## skill\nDetect X');

    const without = assemblePrompt({ ...COMMON });
    expect(without.assembly.skills).toBeNull();
  });
});
