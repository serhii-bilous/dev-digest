import { describe, it, expect } from 'vitest';
import { classifyFailure, parseEnvelope, readUsage, redact, truncate, isSuccess } from './envelope.js';
import { fixture } from './test-helpers.js';

const run = (name: string, extra: Partial<Parameters<typeof classifyFailure>[0]> = {}, token?: string) => {
  const stdout = fixture(name);
  return classifyFailure({ exitCode: 1, stdout, stderr: '', envelope: parseEnvelope(stdout), ...extra }, token);
};

describe('envelope', () => {
  it('reads usage, null when missing (AC-41)', () => {
    expect(readUsage(parseEnvelope(fixture('success.json')))).toEqual({ tokensIn: 120, tokensOut: 34 });
    expect(readUsage(parseEnvelope(fixture('success-no-usage.json')))).toEqual({ tokensIn: null, tokensOut: null });
    expect(isSuccess(parseEnvelope(fixture('success.json')))).toBe(true);
  });
});

describe('classifyFailure: one fixture per AC-27 reason (AC-28..32)', () => {
  it('auth_failed', () => {
    const c = run('auth-failed.json');
    expect(c.reason).toBe('auth_failed');
    expect(c.message).toContain('claude setup-token');
  });
  it('rate_limited with reset text, session limit', () => {
    const c = run('session-limit.json');
    expect(c.reason).toBe('rate_limited');
    expect(c.message).toContain('3:45pm');
  });
  it('rate_limited via 429', () => {
    expect(run('rate-429.json').reason).toBe('rate_limited');
  });
  it('timeout', () => {
    expect(classifyFailure({ exitCode: null, stdout: '', stderr: '', timedOut: true, envelope: null }).reason).toBe('timeout');
  });
  it('cli_error: bad flag stderr', () => {
    const c = classifyFailure({ exitCode: 1, stdout: '', stderr: "error: unknown option '--bogus'", envelope: null });
    expect(c.reason).toBe('cli_error');
    expect(c.message).toContain('--bogus');
  });
  it('cli_error: long stderr truncated to 500 and token redacted', () => {
    const tok = 'SENTINEL-TOKEN-123';
    const c = classifyFailure({ exitCode: 1, stdout: '', stderr: `${tok} ${'x'.repeat(2000)}`, envelope: null }, tok);
    expect(c.reason).toBe('cli_error');
    expect(c.message.length).toBeLessThanOrEqual(500);
    expect(c.message).not.toContain(tok);
  });
});

describe('redact/truncate (NFR-3, AC-32)', () => {
  it('redacts all occurrences and oauth-shaped strings', () => {
    expect(redact('a TOK b TOK sk-ant-oat01-abcdefghij', 'TOK')).toBe('a [redacted] b [redacted] [redacted]');
  });
  it('truncates to 500', () => {
    expect(truncate('y'.repeat(900)).length).toBe(500);
  });
});
