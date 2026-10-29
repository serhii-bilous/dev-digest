import { describe, it, expect } from 'vitest';
import {
  GENERAL_REVIEWER_PYTHON_PROMPT as GENERAL,
  SECURITY_REVIEWER_PYTHON_PROMPT as SECURITY,
  PERFORMANCE_REVIEWER_PYTHON_PROMPT as PERF,
  TEST_QUALITY_REVIEWER_PYTHON_PROMPT as TESTQ,
} from '../src/db/seed-prompts.js';

const has = (p: string, terms: string[]) => terms.forEach((x) => expect(p).toContain(x));
const all = [GENERAL, SECURITY, PERF, TESTQ];

describe('Python built-in prompts', () => {
  it('General (AC-48): Python 3, typing, exceptions, asyncio; no Node/TS/ESM', () => {
    has(GENERAL, ['Python 3', 'type hint', 'exception', 'asyncio']);
    expect(GENERAL).not.toMatch(/node\.?js|typescript|\besm\b|\bnpm\b/i);
  });
  it('Security (AC-49)', () => {
    has(SECURITY, ['eval', 'exec', 'pickle', 'yaml.load', 'shell=True', 'SQL', 'requests', 'SSRF']);
    expect(SECURITY).toMatch(/secret/i);
  });
  it('Performance (AC-50)', () => {
    has(PERF, ['N+1', 'Django', 'SQLAlchemy', 'async', 'loop']);
    expect(PERF).toMatch(/materiali[sz]ation/i);
  });
  it('Test Quality (AC-51)', () => {
    has(TESTQ, ['fixture', 'parametrize', 'unittest.mock', 'monkeypatch']);
    expect(TESTQ).toMatch(/missing assertions/i);
    expect(TESTQ).toMatch(/flaky/i);
    expect(TESTQ).toMatch(/random/);
    expect(TESTQ).toMatch(/ordering/);
  });
  it('none carry the project-specific stack block', () => {
    for (const p of all) {
      expect(p).not.toMatch(/myTube|run_tests\.py|127\.0\.0\.1|media pipeline|ffmpeg|\bTTS\b|no SQL database|FastAPI/i);
      expect(p).toContain('# Stack context');
    }
  });
});
