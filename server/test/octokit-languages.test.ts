import { describe, it, expect } from 'vitest';
import { parseLanguages } from '../src/adapters/github/octokit.js';

describe('parseLanguages (GitHub payload validation)', () => {
  it('accepts a valid map', () => {
    expect(parseLanguages({ TypeScript: 10, Go: 0 })).toEqual({ TypeScript: 10, Go: 0 });
  });

  it('throws on malformed payloads', () => {
    expect(() => parseLanguages(null)).toThrow();
    expect(() => parseLanguages({ Go: 'x' })).toThrow();
    expect(() => parseLanguages({ Go: -1 })).toThrow();
    expect(() => parseLanguages({ Go: 1.5 })).toThrow();
    expect(() => parseLanguages({ '': 1 })).toThrow();
    expect(() => parseLanguages({ ['x'.repeat(101)]: 1 })).toThrow();
  });

  it('keeps the 200 largest entries', () => {
    const big = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`L${i}`, i + 1]));
    const out = parseLanguages(big);
    expect(Object.keys(out)).toHaveLength(200);
    expect(out.L249).toBe(250);
    expect(out.L49).toBeUndefined();
    expect(out.L50).toBe(51);
  });
});
