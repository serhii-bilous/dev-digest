import type { LocalFailureReason, LocalUnavailableReason } from '@devdigest/shared';
import { ExternalServiceError } from './errors.js';

/**
 * Local (Claude Code CLI) failure vocabulary, owned by the core so application
 * services depend inward on it; the adapter in `adapters/llm/local/` re-exports
 * these from its own `errors.ts`.
 */

export const AUTH_FAILED_MESSAGE =
  'Claude Code rejected the token. Create a new token with `claude setup-token` and save it in Settings.';
export const TOKEN_MISSING_MESSAGE =
  'No Claude Code token is configured. Create one with `claude setup-token` and save it in Settings.';
export const CLI_MISSING_MESSAGE = 'The Claude Code CLI is not installed or not executable.';

/** A Local (Claude Code CLI) failure carrying exactly one AC-27 reason. */
export class LocalProviderError extends ExternalServiceError {
  readonly reason: LocalFailureReason;
  readonly queuedMs?: number;

  constructor(reason: LocalFailureReason, message: string, opts: { queuedMs?: number } = {}) {
    super(message, { reason });
    this.name = 'LocalProviderError';
    this.reason = reason;
    this.queuedMs = opts.queuedMs;
  }
}

/** The error for "Local can't run at all" (probe failed): no spawn happens. */
export function localUnavailableError(reason: LocalUnavailableReason): LocalProviderError {
  return new LocalProviderError(
    reason,
    reason === 'token_missing' ? TOKEN_MISSING_MESSAGE : CLI_MISSING_MESSAGE,
  );
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

export function abortError(): Error {
  const e = new Error('Local call cancelled');
  e.name = 'AbortError';
  return e;
}

/** Per-run context a Local provider is bound to. */
export interface LocalRunContext {
  runId?: string;
  signal?: AbortSignal;
  onQueued?: () => void;
}

export interface LocalLogger {
  info: (obj: unknown, msg?: string) => void;
}

/** How a run is billed: Local is a flat subscription, everything else per token. */
export function billingFor(provider: string | null | undefined): 'api' | 'subscription' {
  return provider === 'local' ? 'subscription' : 'api';
}
