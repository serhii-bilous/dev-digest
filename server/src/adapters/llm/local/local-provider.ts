import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  ChatMessage,
  LocalModelAlias,
} from '@devdigest/shared';
import { LOCAL_MODEL_ALIASES, LOCAL_MODEL_LABELS } from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from '../../../platform/structured.js';
import { ExternalServiceError } from '../../../platform/errors.js';
import type { CliRunner, CliRunResult } from './cli-runner.js';
import type { LocalSlotGate } from './slot-gate.js';
import {
  type CliEnvelope,
  classifyFailure,
  isStructuredRetryExhausted,
  isSuccess,
  parseEnvelope,
  payloadOf,
  readUsage,
  safeMessage,
} from './envelope.js';
import {
  LocalProviderError,
  TOKEN_MISSING_MESSAGE,
  abortError,
  isAbortError,
  localUnavailableError,
  type LocalLogger,
  type LocalRunContext,
} from '../../../platform/local-errors.js';
import type { LocalStatus } from '@devdigest/shared';

export type { LocalLogger, LocalRunContext };

export interface LocalProviderDeps {
  runner: Pick<CliRunner, 'run'>;
  gate: Pick<LocalSlotGate, 'acquire'>;
  probe: () => Promise<LocalStatus>;
  getToken: () => Promise<string | undefined> | string | undefined;
  logger: LocalLogger;
  ctx?: LocalRunContext;
  now?: () => number;
}

function splitMessages(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  return {
    system: messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n'),
    rest: messages.filter((m) => m.role !== 'system'),
  };
}

function renderConversation(rest: ChatMessage[]): string {
  if (rest.length === 1 && rest[0]!.role === 'user') return rest[0]!.content;
  return rest.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}:\n${m.content}`).join('\n\n');
}

function asAlias(model: string): LocalModelAlias {
  if ((LOCAL_MODEL_ALIASES as readonly string[]).includes(model)) return model as LocalModelAlias;
  throw new LocalProviderError('cli_error', `Unsupported Local model "${model.slice(0, 40)}".`);
}

interface CallState {
  queuedMs: number;
  outcome: string;
}

/**
 * LLMProvider backed by the Claude Code CLI (subscription). Run-scoped: the
 * container builds one per run with that run's context. Never falls back to
 * another provider.
 */
export class LocalClaudeProvider implements LLMProvider {
  readonly id = 'local' as const;

  constructor(private readonly deps: LocalProviderDeps) {}

  async listModels(): Promise<ModelInfo[]> {
    return LOCAL_MODEL_ALIASES.map((a) => ({ id: a, provider: 'local' as const, label: LOCAL_MODEL_LABELS[a] }));
  }

  async embed(): Promise<number[][]> {
    throw new ExternalServiceError('embeddings not supported by Local');
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const alias = asAlias(req.model);
    const { system, rest } = splitMessages(req.messages);
    return this.guarded(alias, async (_state, token) => {
      const { envelope } = await this.invoke(alias, system, renderConversation(rest), token);
      return {
        text: typeof envelope.result === 'string' ? envelope.result : '',
        model: alias,
        ...readUsage(envelope),
        costUsd: 0,
      };
    });
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const alias = asAlias(req.model);
    const { system, rest } = splitMessages(req.messages);
    const schema = toJsonSchema(req.schema, req.schemaName).schema;
    const maxRetries = req.maxRetries ?? 2;

    return this.guarded(alias, async (state, token) => {
      let conversation = renderConversation(rest);
      let tIn: number | null = null;
      let tOut: number | null = null;
      let lastRaw = '';
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const { envelope, retryExhausted } = await this.invoke(alias, system, conversation, token, schema, true);
        const u = readUsage(envelope);
        if (u.tokensIn !== null) tIn = (tIn ?? 0) + u.tokensIn;
        if (u.tokensOut !== null) tOut = (tOut ?? 0) + u.tokensOut;
        if (!retryExhausted) {
          lastRaw = payloadOf(envelope);
          const parsed = parseWithRepair(req.schema, lastRaw);
          if (parsed.ok) {
            return { data: parsed.data, model: alias, tokensIn: tIn, tokensOut: tOut, costUsd: 0, raw: lastRaw, attempts: attempt };
          }
          conversation = `${conversation}\n\nAssistant:\n${lastRaw}\n\nUser:\n${parsed.repromptMessage}`;
        } else {
          // Nothing parseable to correct: still send a changed prompt, never an identical call.
          conversation = `${conversation}\n\nUser:\nYour previous reply did not satisfy the required JSON schema. Reply again with only JSON that matches the schema exactly.`;
        }
      }
      state.outcome = 'invalid_output';
      throw new LocalProviderError('invalid_output', 'Claude Code returned output that failed schema validation.', {
        queuedMs: state.queuedMs,
      });
    });
  }

  /** Probe → slot → work → release, with one NFR-10 log line per call. */
  private async guarded<R>(
    alias: string,
    work: (state: CallState, token: string) => Promise<R>,
  ): Promise<R> {
    const now = this.deps.now ?? Date.now;
    const started = now();
    const state: CallState = { queuedMs: 0, outcome: 'ok' };
    let lease: { release: () => void } | undefined;
    try {
      const status = await this.deps.probe();
      if (!status.available) {
        throw localUnavailableError(status.reason ?? 'cli_missing');
      }
      const token = await this.deps.getToken();
      if (!token) throw new LocalProviderError('token_missing', TOKEN_MISSING_MESSAGE);
      const ctx = this.deps.ctx ?? {};
      const acquired = await this.deps.gate.acquire({ runId: ctx.runId, signal: ctx.signal, onQueued: ctx.onQueued });
      lease = acquired;
      state.queuedMs = acquired.queuedMs;
      return await work(state, token);
    } catch (e) {
      if (isAbortError(e)) state.outcome = 'cancelled';
      else if (e instanceof LocalProviderError) state.outcome = e.reason;
      else state.outcome = 'cli_error';
      if (e instanceof LocalProviderError && e.queuedMs === undefined) {
        throw new LocalProviderError(e.reason, e.message, { queuedMs: state.queuedMs });
      }
      throw e;
    } finally {
      lease?.release();
      this.deps.logger.info(
        {
          runId: this.deps.ctx?.runId,
          model: alias,
          queuedMs: state.queuedMs,
          durationMs: now() - started,
          outcome: state.outcome,
        },
        'local claude call',
      );
    }
  }

  /** One CLI call. Throws on any classified CLI failure; no retry. */
  private async invoke(
    alias: string,
    system: string,
    prompt: string,
    token: string,
    schema?: unknown,
    allowRetryExhausted = false,
  ): Promise<{ result: CliRunResult; envelope: CliEnvelope; retryExhausted: boolean }> {
    const result = await this.deps.runner.run({
      alias,
      systemPrompt: system,
      prompt,
      jsonSchema: schema,
      token,
      signal: this.deps.ctx?.signal,
    });
    if (result.aborted) throw abortError();
    const envelope = parseEnvelope(result.stdout);
    if (!result.timedOut && result.exitCode === 0 && isSuccess(envelope)) {
      return { result, envelope, retryExhausted: false };
    }
    if (allowRetryExhausted && !result.timedOut && isStructuredRetryExhausted(envelope)) {
      return { result, envelope: envelope!, retryExhausted: true };
    }
    const c = classifyFailure({ ...result, envelope }, token);
    throw new LocalProviderError(c.reason, safeMessage(c.message, token));
  }
}
