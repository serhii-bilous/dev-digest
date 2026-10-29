import type { LocalFailureReason } from '@devdigest/shared';
import { AUTH_FAILED_MESSAGE } from './errors.js';

export const MAX_MESSAGE_CHARS = 500;

export interface CliEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
  errors?: unknown;
  api_error_status?: number | null;
}

export function parseEnvelope(stdout: string): CliEnvelope | null {
  const text = stdout.trim();
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (Array.isArray(v)) {
      const r = [...v].reverse().find((x) => x && typeof x === 'object' && (x as CliEnvelope).type === 'result');
      return (r as CliEnvelope) ?? null;
    }
    return v && typeof v === 'object' ? (v as CliEnvelope) : null;
  } catch {
    return null;
  }
}

export function isSuccess(env: CliEnvelope | null): env is CliEnvelope {
  return !!env && env.type === 'result' && !env.is_error && (env.subtype === undefined || env.subtype === 'success');
}

export function isStructuredRetryExhausted(env: CliEnvelope | null): boolean {
  return env?.subtype === 'error_max_structured_output_retries';
}

export function readUsage(env: CliEnvelope | null): { tokensIn: number | null; tokensOut: number | null } {
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return { tokensIn: num(env?.usage?.input_tokens), tokensOut: num(env?.usage?.output_tokens) };
}

/** Raw model payload to validate: structured_output first, else the text result. */
export function payloadOf(env: CliEnvelope): string {
  if (env.structured_output !== undefined && env.structured_output !== null) {
    return typeof env.structured_output === 'string'
      ? env.structured_output
      : JSON.stringify(env.structured_output);
  }
  return typeof env.result === 'string' ? env.result : '';
}

export function redact(text: string, token?: string): string {
  let out = text;
  if (token) out = out.split(token).join('[redacted]');
  // Defense in depth: any Claude OAuth-token-shaped string.
  out = out.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted]');
  return out;
}

export function truncate(text: string, max = MAX_MESSAGE_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function safeMessage(text: string, token?: string): string {
  return truncate(redact(text, token).trim());
}

const AUTH_RE =
  /authentication_failed|invalid[_ ](?:x-api-key|api key|token|bearer)|oauth token (?:has )?(?:expired|revoked|invalid)|token (?:has )?expired|not logged in|please run \/login|unauthorized|invalid authentication|\b401\b/i;
const RATE_RE =
  /(?:session|weekly|usage|5-hour|opus) limit|limit reached|rate[_ -]?limit|too many requests|\b429\b/i;
const RESET_RE = /resets?\s+(?:at\s+)?([^\n.]{1,60})/i;

export interface FailureInput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  timeoutMs?: number;
  aborted?: boolean;
  envelope: CliEnvelope | null;
}

export interface Classified {
  reason: Exclude<LocalFailureReason, 'cli_missing' | 'token_missing' | 'invalid_output'>;
  message: string;
}

/** Map a failed CLI call to exactly one AC-27 reason. `token` is redacted from text. */
export function classifyFailure(f: FailureInput, token?: string): Classified {
  if (f.timedOut) return { reason: 'timeout', message: `Claude Code did not finish within ${Math.round((f.timeoutMs ?? 300_000) / 1000)} seconds.` };
  const env = f.envelope;
  const errs = Array.isArray(env?.errors) ? env!.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join(' ') : '';
  const text = [typeof env?.result === 'string' ? env.result : '', errs, f.stderr].join('\n');
  const status = env?.api_error_status ?? null;

  if (status === 401 || AUTH_RE.test(text)) {
    return { reason: 'auth_failed', message: AUTH_FAILED_MESSAGE };
  }
  if (status === 429 || RATE_RE.test(text)) {
    const m = RESET_RE.exec(text);
    const reset = m ? ` (resets ${safeMessage(m[1]!, token)})` : '';
    return { reason: 'rate_limited', message: `Claude subscription usage limit reached${reset}.` };
  }
  const detail = safeMessage(f.stderr || (typeof env?.result === 'string' ? env.result : '') || errs || f.stdout, token);
  const base = f.exitCode === null ? 'Claude Code was terminated' : `Claude Code exited with code ${f.exitCode}`;
  return { reason: 'cli_error', message: truncate(detail ? `${base}: ${detail}` : base) };
}
