import { describe, it, expect } from 'vitest';
import {
  classifyFetchError,
  incompatibleError,
  codeLanguages,
  codeLanguagesExact,
  deriveStack,
  diffCompatible,
  isCompatible,
  resolveEntries,
} from '../src/platform/stack-compat.js';
import { ConfigError } from '../src/platform/errors.js';

const T = new Date('2026-01-01T00:00:00Z');
const row = (o: Partial<Parameters<typeof deriveStack>[0]> = {}) => ({
  languages: null,
  languagesFetchedAt: null,
  languagesAttemptedAt: null,
  languagesFailure: null,
  ...o,
});
const ex = (m: Record<string, number>) => codeLanguagesExact(m);
const known = { status: 'known' as const };

describe('codeLanguages (AC-4)', () => {
  it('drops non-code languages case-insensitively and divides by the remaining total', () => {
    const r = codeLanguages({ Python: 900, Shell: 5000, TypeScript: 100, dockerfile: 99, 'Jupyter Notebook': 9 });
    expect(r).toEqual([
      { name: 'Python', bytes: 900, percent: 90 },
      { name: 'TypeScript', bytes: 100, percent: 10 },
    ]);
  });
  it('is empty for {} or only non-code', () => {
    expect(codeLanguages({})).toEqual([]);
    expect(codeLanguages({ Shell: 10, HTML: 4 })).toEqual([]);
  });
});

describe('deriveStack (AC-5..9)', () => {
  it('null when never attempted', () => expect(deriveStack(row())).toBeNull());
  it('known on a code map', () => {
    const s = deriveStack(row({ languages: { Python: 1 }, languagesAttemptedAt: T, languagesFetchedAt: T }))!;
    expect(s.status).toBe('known');
    expect(s.reason).toBeUndefined();
    expect(s.fetched_at).toBe(T.toISOString());
  });
  it('unknown/no_code_languages for {} and for only-non-code (AC-8)', () => {
    for (const languages of [{}, { Shell: 10 }]) {
      const s = deriveStack(row({ languages, languagesAttemptedAt: T }))!;
      expect([s.status, s.reason, s.languages]).toEqual(['unknown', 'no_code_languages', []]);
    }
  });
  it('failure without map → unknown with that reason', () => {
    for (const r of ['no_token', 'no_access', 'unreachable']) {
      expect(deriveStack(row({ languagesAttemptedAt: T, languagesFailure: r }))).toMatchObject({
        status: 'unknown',
        reason: r,
      });
    }
  });
  it('failure with a kept map → stale, languages unchanged (AC-9)', () => {
    const s = deriveStack(row({ languages: { Python: 5 }, languagesAttemptedAt: T, languagesFailure: 'no_access' }))!;
    expect(s).toMatchObject({ status: 'stale', reason: 'no_access' });
    expect(s.languages).toHaveLength(1);
  });
});

describe('isCompatible (AC-15/16)', () => {
  const decl = ['TypeScript', 'JavaScript'];
  it('compatible at 10%, incompatible at 5%', () => {
    expect(isCompatible(decl, known, ex({ Python: 900, TypeScript: 100 }))).toBe(true);
    expect(isCompatible(decl, known, ex({ Python: 950, TypeScript: 50 }))).toBe(false);
  });
  it('threshold uses unrounded values (9.96% is not 10%)', () => {
    expect(isCompatible(['Go'], known, ex({ Go: 996, Python: 9004 }))).toBe(false);
  });
  it('matches case-insensitively', () => {
    expect(isCompatible(['typescript'], known, ex({ TypeScript: 10 }))).toBe(true);
  });
  it('any / null always compatible; unknown and null stack always compatible', () => {
    expect(isCompatible('any', known, ex({ Python: 1 }))).toBe(true);
    expect(isCompatible(null, known, ex({ Python: 1 }))).toBe(true);
    expect(isCompatible(decl, { status: 'unknown' }, [])).toBe(true);
    expect(isCompatible(decl, null, [])).toBe(true);
  });
  it('stale uses the kept breakdown', () => {
    expect(isCompatible(['Python'], { status: 'stale' }, ex({ Python: 1 }))).toBe(true);
    expect(isCompatible(decl, { status: 'stale' }, ex({ Python: 1 }))).toBe(false);
  });
});

describe('resolveEntries (AC-17/18a/40-42)', () => {
  const agents = [
    { id: 'py', languages: ['Python'] },
    { id: 'ts', languages: ['TypeScript'] },
    { id: 'any', languages: null },
  ];
  const py = ex({ Python: 100 });
  it('no state row → inactive (AC-18a/41)', () => {
    const e = resolveEntries(agents, [], known, py);
    expect(e.map((x) => [x.agent.id, x.compatible, x.active])).toEqual([
      ['py', true, false],
      ['ts', false, false],
      ['any', true, false],
    ]);
  });
  it('keeps stored state while unknown and after becoming known Python (AC-40)', () => {
    const states = [
      { agentId: 'py', active: true },
      { agentId: 'any', active: false },
    ];
    const before = resolveEntries(agents, states, { status: 'unknown' }, []);
    const after = resolveEntries(agents, states, known, py);
    expect(before.find((x) => x.agent.id === 'py')!.active).toBe(true);
    expect(after.find((x) => x.agent.id === 'py')!.active).toBe(true);
    expect(after.find((x) => x.agent.id === 'any')!.active).toBe(false);
  });
  it('restores stored state when an agent becomes compatible again, not reset (AC-42)', () => {
    const states = [
      { agentId: 'ts', active: true },
      { agentId: 'py', active: false },
    ];
    const hidden = resolveEntries(agents, states, known, py);
    expect(hidden.find((x) => x.agent.id === 'ts')!.compatible).toBe(false);
    const back = resolveEntries(agents, states, known, ex({ TypeScript: 100 }));
    expect(back.find((x) => x.agent.id === 'ts')).toMatchObject({ compatible: true, active: true });
    expect(back.find((x) => x.agent.id === 'py')).toMatchObject({ compatible: false, active: false });
  });
  it('re-reads the declaration each call (AC-17)', () => {
    const a = [{ id: 'x', languages: ['Go'] as string[] | null }];
    expect(resolveEntries(a, [], known, py)[0]!.compatible).toBe(false);
    a[0]!.languages = ['Python'];
    expect(resolveEntries(a, [], known, py)[0]!.compatible).toBe(true);
  });
});

describe('diffCompatible (NFR-11)', () => {
  it('counts flips in both directions', () => {
    const agents = [
      { id: 'py', languages: ['Python'] },
      { id: 'ts', languages: ['TypeScript'] },
      { id: 'any', languages: null },
    ];
    const d = diffCompatible(
      agents,
      { stack: { status: 'unknown' }, exact: [] },
      { stack: known, exact: ex({ Python: 100 }) },
    );
    expect(d).toEqual({ became_compatible: 0, became_incompatible: 1 });
  });
});

describe('classifyFetchError (AC-5/6/7, NFR-6)', () => {
  it('maps errors to the closed enum', () => {
    expect(classifyFetchError(new ConfigError('no token'))).toBe('no_token');
    expect(classifyFetchError({ status: 403 })).toBe('no_access');
    expect(classifyFetchError({ status: 404 })).toBe('no_access');
    expect(classifyFetchError({ status: 500 })).toBe('unreachable');
    expect(classifyFetchError(new Error('ECONNRESET'))).toBe('unreachable');
    expect(classifyFetchError(undefined)).toBe('unreachable');
  });

  it('401 is "any other non-2xx" per AC-7 -> unreachable (AC-6 names only 403/404)', () => {
    expect(classifyFetchError({ status: 401 })).toBe('unreachable');
  });

  it('a rate-limited 403 is transient -> unreachable; a plain 403 stays no_access', () => {
    expect(
      classifyFetchError({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } }),
    ).toBe('unreachable');
    expect(classifyFetchError({ status: 403, message: 'API rate limit exceeded for user' })).toBe('unreachable');
    expect(
      classifyFetchError({
        status: 403,
        response: { data: { documentation_url: 'https://docs.github.com/rest/overview/rate-limits' } },
      }),
    ).toBe('unreachable');
    expect(
      classifyFetchError({ status: 403, response: { headers: { 'x-ratelimit-remaining': '4999' } } }),
    ).toBe('no_access');
    expect(classifyFetchError({ status: 403 })).toBe('no_access');
  });
});

describe('incompatibleError', () => {
  it('lists only languages at/above the threshold, from unrounded percents', () => {
    const exact = [
      { name: 'Python', bytes: 900, percent: 90 },
      { name: 'Go', bytes: 99, percent: 9.99 },
      { name: 'Rust', bytes: 10, percent: 10 },
    ];
    const err = incompatibleError('Go reviewer', ['Go'], exact);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('agent_incompatible');
    expect(err.details).toEqual({ agent_languages: ['Go'], repo_languages: ['Python', 'Rust'] });
  });
});
